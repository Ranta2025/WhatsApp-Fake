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
	db                  *gorm.DB
	redis               *redis.Client
	cancelStatusCleanup context.CancelFunc
}

// New conecta con las dependencias externas y construye la aplicación.
func New() (*App, error) {
	db, rd, mc, err := database.GetConection()
	if err != nil {
		return nil, err
	}
	seedDemoData(db)

	engine, err := newEngine()
	if err != nil {
		return nil, err
	}
	engine.GET("/healthz", healthHandler(db, rd))
	deps, cancelStatusCleanup := buildDeps(db, rd, mc)
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
		db:                  db,
		redis:               rd,
		cancelStatusCleanup: cancelStatusCleanup,
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
		status := gin.H{"postgres": "ok", "redis": "ok"}
		healthy := true
		if sqlDB, err := db.DB(); err != nil || sqlDB.PingContext(ctx) != nil {
			status["postgres"] = "error"
			healthy = false
		}
		if err := rd.Ping(ctx).Err(); err != nil {
			status["redis"] = "error"
			healthy = false
		}
		if !healthy {
			c.JSON(http.StatusServiceUnavailable, status)
			return
		}
		c.JSON(http.StatusOK, status)
	}
}

// newEngine crea el motor de Gin con los middlewares globales.
func newEngine() (*gin.Engine, error) {
	if os.Getenv("ENV") == "production" {
		gin.SetMode(gin.ReleaseMode)
	}
	engine := gin.New()
	// Los handlers pasan el *gin.Context como context.Context a los servicios:
	// con esto, la cancelación/timeout de la petición llega hasta la BD.
	engine.ContextWithFallback = true
	engine.Use(gin.Recovery(), config.Cors(), middleware.TimeMiddleware())

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
// su función de cancelación, para poder detenerlo en un apagado ordenado.
func buildDeps(db *gorm.DB, rd *redis.Client, mc *minio.Client) (routers.Deps, context.CancelFunc) {
	// Repositorios
	repoUser := repos.GetRespositorieUser(db)
	repoContact := repos.InitRepoContact(db, rd)
	repoGroup := repos.InitRepoGroup(db, rd)
	cacheUser := cache.InitChacheUser(rd)

	// Hub de WebSocket (presencia y mensajería en tiempo real)
	hub := websocket.NewHub(repoContact)
	go hub.Run()

	// Servicios
	serviceUser := services.InitServices(repoUser, cacheUser)
	serviceContact := services.InitServiceContact(repoContact)
	serviceChat := services.InitServiceMessage(repoContact)
	serviceCall := services.InitServiceCall(repoContact)
	serviceGroup := services.InitServiceGroup(repoGroup, repoContact)
	serviceMedia := services.InitServiceMedia(mc)
	serviceBugReport := services.InitServiceBugReport()
	serviceStatus := services.InitServiceStatus(repoContact)

	cleanupCtx, cancelCleanup := context.WithCancel(context.Background())
	go statusCleanupLoop(cleanupCtx, serviceStatus, statusCleanupInterval)

	return routers.Deps{
		HandlerUser:      handlers.GetHandlerUser(serviceUser, hub),
		HandlerContact:   handlers.InitHandlerApiMessage(serviceContact, hub),
		HandlerChat:      handlers.InitHandlerChat(serviceChat, hub),
		HandlerCall:      handlers.InitHandlerCall(serviceCall),
		HandlerMedia:     handlers.InitHandlerMedia(serviceMedia),
		HandlerGroup:     handlers.InitHandlerGroup(serviceGroup, hub),
		HandlerStatus:    handlers.InitHandlerStatus(serviceStatus, hub),
		HandlerBugReport: handlers.InitHandlerBugReport(serviceBugReport),
		Hub:              hub,
		WSTickets:        cache.NewWSTicketStore(rd),
		ChatService:      serviceChat,
		ContactService:   serviceContact,
		CallService:      serviceCall,
		GroupService:     serviceGroup,
	}, cancelCleanup
}

// statusCleanupLoop borra periódicamente los estados expirados (y sus vistas).
// Se detiene cuando ctx se cancela (apagado ordenado del servidor).
func statusCleanupLoop(ctx context.Context, service services.StatusServicer, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			deleted, err := service.CleanupExpiredStatuses(ctx)
			if err != nil {
				log.Printf("[STATUS-CLEANUP] Error limpiando estados expirados: %v", err)
			} else if deleted > 0 {
				log.Printf("[STATUS-CLEANUP] %d estados expirados eliminados", deleted)
			}
		}
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

	select {
	case err := <-errCh:
		return err
	case <-ctx.Done():
	}

	log.Println("[APP] Apagando el servidor...")
	if a.cancelStatusCleanup != nil {
		a.cancelStatusCleanup()
	}
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	err := a.server.Shutdown(shutdownCtx)

	if sqlDB, dbErr := a.db.DB(); dbErr == nil {
		sqlDB.Close()
	}
	a.redis.Close()
	return err
}
