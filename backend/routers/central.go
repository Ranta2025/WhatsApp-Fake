package routers

import (
	"gorm/backend/handlers"
	"gorm/backend/middleware"
	"gorm/backend/routers/api"
	"gorm/backend/routers/log"
	"gorm/backend/services"
	"gorm/backend/websocket"
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

	subrouter := app.Group("/api/v1/")
	apiMessage := api.InitRouterApiMessage(subrouter, d.HandlerContact, d.HandlerChat, d.HandlerCall, d.HandlerMedia, d.HandlerGroup, d.Hub, d.ChatService, d.ContactService, d.CallService, d.GroupService)
	apiMessage.ApiUser()
	apiMessage.ApiContact()
	apiMessage.ApiChat()
	apiMessage.ApiMedia()
	apiMessage.ApiCall()
	apiMessage.ApiGroup()
	apiMessage.ApiWebSocket()
}
