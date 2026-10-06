// Package app es la raíz de composición del backend: crea las conexiones,
// construye repositorios → servicios → handlers, registra las rutas y
// gestiona el ciclo de vida del servidor HTTP (arranque y apagado ordenado).
package app

import (
	"context"
	"errors"
	"gorm/backend/cache"
	"gorm/backend/config"
	"gorm/backend/database"
	"gorm/backend/handlers"
	"gorm/backend/metrics"
	"gorm/backend/middleware"
	"gorm/backend/repos"
	"gorm/backend/routers"
	"gorm/backend/services"
	"gorm/backend/websocket"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/minio/minio-go/v7"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

// App contiene el servidor HTTP y los recursos que hay que cerrar al apagar.
type App struct {
	server              *http.Server
	metricsServer       *http.Server
	db                  *gorm.DB
	redis               *redis.Client
	cancelStatusCleanup context.CancelFunc
	// closePush cierra el despacho de Web Push: espera los envíos encolados
	// hasta que vence el contexto y entonces aborta los que queden.
	closePush func(context.Context) error
}

// New conecta con las dependencias externas y construye la aplicación.
func New() (*App, error) {
	db, rd, mc, err := database.GetConection()
	if err != nil {
		return nil, err
	}
	seedDemoData(db)

	backendMetrics := metrics.New(metrics.NewRegistry())

	engine, err := newEngine(backendMetrics)
	if err != nil {
		return nil, err
	}
	engine.GET("/healthz", healthHandler(db, rd))
	deps, cancelStatusCleanup, closePush := buildDeps(db, rd, mc, backendMetrics)
	routers.Router(engine, deps)

	return &App{
		server: &http.Server{
			Addr:              listenAddr(),
			Handler:           engine,
			ReadHeaderTimeout: 10 * time.Second,
			// Sin ReadTimeout/WriteTimeout globales: romperían las conexiones
			// WebSocket (de larga duración) y las subidas grandes de video.
			IdleTimeout:    120 * time.Second,
			MaxHeaderBytes: 1 << 20,
		},
		// Listener interno de métricas: se habilita solo con METRICS_ADDR
		// (compose lo setea; en runs locales queda deshabilitado).
		metricsServer:       newMetricsServer(os.Getenv("METRICS_ADDR"), backendMetrics),
		db:                  db,
		redis:               rd,
		cancelStatusCleanup: cancelStatusCleanup,
		closePush:           closePush,
	}, nil
}

// listenAddr devuelve SERVER_ADDR, o 0.0.0.0:$PORT (Render, Railway, Fly...)
// o 0.0.0.0:8080 por defecto.
func listenAddr() string {
	if addr := os.Getenv("SERVER_ADDR"); addr != "" {
		return addr
	}
	if port := os.Getenv("PORT"); port != "" {
		return "0.0.0.0:" + port
	}
	return "0.0.0.0:8080"
}

// healthHandler responde 200 si PostgreSQL y Redis están accesibles
// (usado por el health check de la plataforma de despliegue).
func healthHandler(db *gorm.DB, rd *redis.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
		defer cancel()
		postgresOK, redisOK := checkDependencies(ctx, db, rd)
		status := gin.H{"postgres": "ok", "redis": "ok"}
		if !postgresOK {
			status["postgres"] = "error"
		}
		if !redisOK {
			status["redis"] = "error"
		}
		healthy := postgresOK && redisOK
		if !healthy {
			c.JSON(http.StatusServiceUnavailable, status)
			return
		}
		c.JSON(http.StatusOK, status)
	}
}

// newEngine crea el motor de Gin con los middlewares globales.
func newEngine(m *metrics.Metrics) (*gin.Engine, error) {
	if os.Getenv("ENV") == "production" {
		gin.SetMode(gin.ReleaseMode)
	}
	engine := gin.New()
	// Los handlers pasan el *gin.Context como context.Context a los servicios:
	// con esto, la cancelación/timeout de la petición llega hasta la BD.
	engine.ContextWithFallback = true
	// Orden de middlewares: RequestID primero (todo log/respuesta lleva id),
	// luego Métricas envolviendo a Recovery (un panic ya convertido en 500 por
	// Recovery se cuenta como 500), después CORS; el access log va al final para
	// registrar el estado real de la respuesta.
	engine.Use(
		middleware.RequestID(),
		middleware.Metrics(m),
		middleware.Recovery(),
		config.Cors(),
		middleware.TimeMiddleware(),
	)

	// Solo se confía en X-Forwarded-For de los proxies indicados (nginx /
	// túnel). Si se confiara en todos, cualquiera podría falsear su IP y
	// saltarse los límites de peticiones.
	if err := engine.SetTrustedProxies(trustedProxies()); err != nil {
		return nil, err
	}
	// CLIENT_IP_HEADER: cabecera con la IP real del cliente que añade la
	// plataforma que está delante (p. ej. "X-Real-IP" con las rewrites de
	// Vercel, "CF-Connecting-IP" con Cloudflare). Si falta, se usa X-Forwarded-For.
	if header := os.Getenv("CLIENT_IP_HEADER"); header != "" {
		engine.TrustedPlatform = header
	}

	engine.GET("/", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"message": "Welcome"})
	})
	return engine, nil
}

// metricsHandler sirve GET /metrics en el listener interno y responde 404 en
// cualquier otra ruta: este listener solo expone las métricas, nunca la SPA ni
// la API.
func metricsHandler(m *metrics.Metrics) http.Handler {
	metricsEndpoint := m.Handler()
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/metrics" {
			http.NotFound(w, r)
			return
		}
		metricsEndpoint.ServeHTTP(w, r)
	})
}

// newMetricsServer construye el segundo http.Server (listener de métricas).
// Devuelve nil cuando addr está vacío: METRICS_ADDR vacío = métricas
// deshabilitadas (runs locales y tests; compose lo setea en OB6).
func newMetricsServer(addr string, m *metrics.Metrics) *http.Server {
	if addr == "" {
		return nil
	}
	return &http.Server{
		Addr:              addr,
		Handler:           metricsHandler(m),
		ReadHeaderTimeout: 10 * time.Second,
	}
}

// trustedProxies lee TRUSTED_PROXIES (lista separada por comas) o usa por
// defecto loopback y las redes privadas (Docker / red local).
func trustedProxies() []string {
	if raw := os.Getenv("TRUSTED_PROXIES"); raw != "" {
		var proxies []string
		for _, p := range strings.Split(raw, ",") {
			if p = strings.TrimSpace(p); p != "" {
				proxies = append(proxies, p)
			}
		}
		return proxies
	}
	return []string{"127.0.0.1/8", "::1/128", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"}
}

// statusCleanupInterval es cada cuánto se ejecuta el job de limpieza de estados expirados.
const statusCleanupInterval = 10 * time.Minute

// buildDeps construye el grafo de dependencias: repositorios → servicios → handlers.
// También arranca el job periódico de limpieza de estados expirados y devuelve
// su función de cancelación, para poder detenerlo en un apagado ordenado, y la
// función que cierra el despacho de Web Push.
func buildDeps(db *gorm.DB, rd *redis.Client, mc *minio.Client, m *metrics.Metrics) (routers.Deps, context.CancelFunc, func(context.Context) error) {
	// Repositorios
	repoUser := repos.GetRespositorieUser(db)
	repoContact := repos.InitRepoContact(db, rd)
	repoGroup := repos.InitRepoGroup(db, rd)
	repoReaction := repos.InitRepoReaction(db)
	repoPush := repos.InitRepoPush(db, repoContact)
	repoMute := repos.InitRepoMute(db, repoContact)
	repoSticker := repos.InitRepoSticker(db, repoContact)
	cacheUser := cache.InitChacheUser(rd)

	// Hub de WebSocket (presencia y mensajería en tiempo real)
	hub := websocket.NewHub(repoContact, m)
	go hub.Run()
	registerRuntimeMetrics(m, hub, db, rd)
	// Reacciones: el evento WS `react` y los endpoints REST comparten servicio.
	hub.SetReactionService(services.NewReactionService(repoReaction))

	// Servicios
	serviceUser := services.InitServices(repoUser, cacheUser)
	serviceContact := services.InitServiceContact(repoContact)
	serviceChat := services.InitServiceMessageWithRecents(repoContact, repoSticker, repoReaction)
	serviceCall := services.InitServiceCall(repoContact)
	serviceGroup := services.InitServiceGroupWithRecents(repoGroup, repoContact, repoSticker, repoReaction)
	mediaStore := services.NewServiceMedia(mc)
	var serviceMedia services.MediaServicer = mediaStore
	serviceBugReport := services.InitServiceBugReport()
	serviceStatus := services.InitServiceStatus(repoContact)
	serviceSearch := services.InitServiceSearch(repoContact, repoGroup)
	pushCfg := config.LoadPushConfig(os.Getenv)
	log.Println(pushStartupMessage(pushCfg))
	servicePush := services.InitServicePush(pushCfg, repoPush)
	// Web Push a destinatarios desconectados: lo usan el WS (1:1 y grupo) y
	// el envío REST a grupos. Asíncrono (pool acotado), nunca bloquea.
	pushNotifier := buildPushNotifier(pushCfg, repoPush, repoContact, repoGroup, repoMute)
	hub.SetPushNotifier(pushNotifier)
	// Silencio por chat: endpoints propios y estado en los listados del
	// sidebar (chats, contactos y grupos).
	serviceMute := services.InitServiceMute(repoMute, repoGroup)
	serviceSticker := services.InitServiceStickerLibrary(mc, repoSticker)
	handlerGroup := handlers.InitHandlerGroup(serviceGroup, hub, m)
	handlerGroup.SetPushNotifier(pushNotifier)
	handlerGroup.SetMuteService(serviceMute)
	handlerContact := handlers.InitHandlerApiMessage(serviceContact, hub)
	handlerContact.SetMuteService(serviceMute)
	handlerChat := handlers.InitHandlerChat(serviceChat, hub)
	handlerChat.SetMuteService(serviceMute)

	cleanupCtx, cancelCleanup := context.WithCancel(context.Background())
	go statusCleanupLoop(cleanupCtx, serviceStatus, statusCleanupInterval)
	// Expiración de mensajes temporales: necesita el hub para avisar a los
	// clientes y comparte el ciclo de vida (cancelación) del job de estados.
	messageExpiry := services.NewMessageExpiryService(repos.InitRepoExpiry(db), mediaStore, hub, m, messageExpiryDryRun())
	go messageExpiryLoop(cleanupCtx, messageExpiry, messageExpiryInterval)
	// El checker de dependencias comparte el ciclo de vida del job de limpieza.
	go dependencyCheckLoop(cleanupCtx, m, func(ctx context.Context) (bool, bool) {
		return checkDependencies(ctx, db, rd)
	}, dependencyCheckInterval, dependencyCheckTimeout)

	return routers.Deps{
		HandlerUser:      handlers.GetHandlerUser(serviceUser, hub),
		HandlerContact:   handlerContact,
		HandlerChat:      handlerChat,
		HandlerCall:      handlers.InitHandlerCall(serviceCall),
		HandlerMedia:     handlers.InitHandlerMedia(serviceMedia),
		HandlerGroup:     handlerGroup,
		HandlerStatus:    handlers.InitHandlerStatus(serviceStatus, hub),
		HandlerSearch:    handlers.InitHandlerSearch(serviceSearch),
		HandlerBugReport: handlers.InitHandlerBugReport(serviceBugReport),
		HandlerPush:      handlers.InitHandlerPush(servicePush),
		HandlerMute:      handlers.InitHandlerMute(serviceMute),
		HandlerSticker:   handlers.InitHandlerSticker(serviceSticker),
		Hub:              hub,
		WSTickets:        cache.NewWSTicketStore(rd),
		ChatService:      serviceChat,
		ContactService:   serviceContact,
		CallService:      serviceCall,
		GroupService:     serviceGroup,
	}, cancelCleanup, pushNotifierCloser(pushNotifier)
}

// statusCleanupLoop borra periódicamente los estados expirados (y sus vistas).
// Corre una limpieza inmediatamente al arrancar (no espera al primer tick,
// para no dejar estados vencidos visibles hasta interval después de un
// despliegue) y luego una vez por cada tick. Un error de una pasada no
// detiene las siguientes; solo se detiene cuando ctx se cancela (apagado
// ordenado del servidor).
func statusCleanupLoop(ctx context.Context, service services.StatusServicer, interval time.Duration) {
	runStatusCleanup(ctx, service)

	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			runStatusCleanup(ctx, service)
		}
	}
}

// runStatusCleanup ejecuta una pasada de limpieza y loggea el resultado.
func runStatusCleanup(ctx context.Context, service services.StatusServicer) {
	deleted, err := service.CleanupExpiredStatuses(ctx)
	if err != nil {
		log.Printf("[STATUS-CLEANUP] Error limpiando estados expirados: %v", err)
	} else if deleted > 0 {
		log.Printf("[STATUS-CLEANUP] %d estados expirados eliminados", deleted)
	}
}

// messageExpiryInterval es cada cuánto corre el job de expiración de mensajes
// temporales. Es corto porque, aunque las lecturas ya ocultan los vencidos, los
// clientes abiertos solo se enteran por el evento `messages_expired`.
const messageExpiryInterval = time.Minute

// messageExpiryRunner ejecuta una pasada del job de expiración.
type messageExpiryRunner interface {
	RunOnce(ctx context.Context) error
}

// messageExpiryDryRun lee MESSAGE_EXPIRY_DRY_RUN: "true" solo cuenta los
// vencidos (para un primer despliegue), sin borrar nada.
func messageExpiryDryRun() bool {
	return strings.EqualFold(strings.TrimSpace(os.Getenv("MESSAGE_EXPIRY_DRY_RUN")), "true")
}

// messageExpiryLoop corre una pasada inmediata al arrancar y luego una por
// tick. Un error no detiene las siguientes; se detiene al cancelar ctx.
func messageExpiryLoop(ctx context.Context, runner messageExpiryRunner, interval time.Duration) {
	runMessageExpiry(ctx, runner)

	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			runMessageExpiry(ctx, runner)
		}
	}
}

// runMessageExpiry ejecuta una pasada y loggea el error (si lo hay).
func runMessageExpiry(ctx context.Context, runner messageExpiryRunner) {
	if err := runner.RunOnce(ctx); err != nil && ctx.Err() == nil {
		log.Printf("[MESSAGE-EXPIRY] Error en la pasada de expiración: %v", err)
	}
}

// Run arranca el servidor y bloquea hasta que ctx se cancela; entonces apaga
// el servidor de forma ordenada (termina las peticiones en curso) y cierra
// las conexiones a PostgreSQL y Redis.
func (a *App) Run(ctx context.Context) error {
	errCh := make(chan error, 1)
	go func() {
		log.Printf("[APP] Servidor escuchando en %s", a.server.Addr)
		if err := a.server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
		close(errCh)
	}()

	// El listener de métricas solo existe si METRICS_ADDR no está vacío. Cuando
	// no existe, metricsErrCh queda nil: su case nunca se dispara.
	var metricsErrCh chan error
	if a.metricsServer != nil {
		metricsErrCh = make(chan error, 1)
		go func() {
			log.Printf("[APP] Métricas escuchando en %s", a.metricsServer.Addr)
			if err := a.metricsServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
				metricsErrCh <- err
			}
		}()
	}

	// Un fallo de cualquiera de los dos listeners entra al mismo apagado
	// ordenado que la cancelación de ctx (jobs, server principal, BD y Redis).
	var runErr error
	select {
	case err := <-errCh:
		runErr = err
	case err := <-metricsErrCh:
		runErr = err
	case <-ctx.Done():
	}

	log.Println("[APP] Apagando el servidor...")
	if a.cancelStatusCleanup != nil {
		a.cancelStatusCleanup()
	}
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	err := a.server.Shutdown(shutdownCtx)
	if a.metricsServer != nil {
		if metricsErr := a.metricsServer.Shutdown(shutdownCtx); metricsErr != nil && err == nil {
			err = metricsErr
		}
	}
	// Con el server apagado ya no se encolan notificaciones: se drenan las
	// pendientes antes de cerrar la BD que usan, dentro del mismo plazo de
	// apagado (al vencer se abortan los envíos en curso).
	if a.closePush != nil {
		if pushErr := a.closePush(shutdownCtx); pushErr != nil {
			log.Printf("[APP] Web Push: envíos pendientes abortados en el apagado: %v", pushErr)
		}
	}

	if a.db != nil {
		if sqlDB, dbErr := a.db.DB(); dbErr == nil {
			sqlDB.Close()
		}
	}
	if a.redis != nil {
		a.redis.Close()
	}
	// El error que provocó el apagado (listener caído) tiene prioridad sobre
	// los errores del propio apagado.
	if runErr != nil {
		return runErr
	}
	return err
}
