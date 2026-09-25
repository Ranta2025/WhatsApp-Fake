package routers

import (
	"gorm/backend/cache"
	"gorm/backend/handlers"
	"gorm/backend/middleware"
	"gorm/backend/routers/api"
	"gorm/backend/routers/log"
	"gorm/backend/services"
	"gorm/backend/websocket"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// Deps agrupa los handlers y servicios que necesitan las rutas.
type Deps struct {
	HandlerUser      *handlers.HandlerUser
	HandlerContact   *handlers.HandlerContact
	HandlerChat      *handlers.HandlerChat
	HandlerCall      *handlers.HandlerCall
	HandlerMedia     *handlers.HandlerMedia
	HandlerGroup     *handlers.HandlerGroup
	HandlerBugReport *handlers.HandlerBugReport
	Hub              *websocket.Hub
	WSTickets        *cache.WSTicketStore
	ChatService      services.ChatServicer
	ContactService   services.ContactServicer
	CallService      services.CallServicer
	GroupService     services.GroupServicer
}

// Router registra todas las rutas de la aplicación: autenticación (log), bug-report
// público y el subgrupo /api/v1/ con usuario, contactos, chat, media, llamadas,
// grupos y WebSocket.
func Router(app *gin.Engine, d Deps) {
	// Rutas de autenticación
	router := log.Log{Router: app, Handler: *d.HandlerUser}
	router.Logs()

	// Ruta pública para reportes de bugs (no requiere autenticación, con límite
	// por IP porque cada reporte crea un issue en GitHub)
	bugLimit := middleware.NewRateLimiter(5, time.Hour).Middleware()
	app.POST("/api/v1/bug-report", bugLimit, middleware.MiddlewareBugReport(), d.HandlerBugReport.HandleReportBug())

	// WebSocket: autenticado por cookie (mismo dominio) o por ticket de un solo
	// uso (frontend en otro dominio). Se registra fuera del grupo protegido
	// porque en ese caso la cookie no llega al backend.
	app.GET("/api/v1/ws", middleware.MiddlewareWebSocketAuth(d.WSTickets),
		websocket.HandleWebSocket(d.Hub, d.ChatService, d.ContactService, d.CallService, d.GroupService))

	subrouter := app.Group("/api/v1/")
	subrouter.GET("ws-ticket", middleware.MiddlewareTokenWithTelephon(), wsTicketHandler(d.WSTickets))
	apiMessage := api.InitRouterApiMessage(subrouter, d.HandlerContact, d.HandlerChat, d.HandlerCall, d.HandlerMedia, d.HandlerGroup, d.Hub, d.ChatService, d.ContactService, d.CallService, d.GroupService)
	apiMessage.ApiUser()
	apiMessage.ApiContact()
	apiMessage.ApiChat()
	apiMessage.ApiMedia()
	apiMessage.ApiCall()
	apiMessage.ApiGroup()
}

// wsTicketHandler emite un ticket de un solo uso (30 s) para abrir el WebSocket.
func wsTicketHandler(store *cache.WSTicketStore) gin.HandlerFunc {
	return func(c *gin.Context) {
		if store == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "tickets no disponibles"})
			return
		}
		ticket, err := store.Create(c.Request.Context(), c.GetString("username"), c.GetString("telephon"))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "error al generar el ticket"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ticket": ticket})
	}
}
