package routers

import (
	"gorm/backend/handlers"
	"gorm/backend/middleware"
	"gorm/backend/routers/api"
	"gorm/backend/routers/log"
	"gorm/backend/services"
	"gorm/backend/websocket"

	"github.com/gin-gonic/gin"
)

// Router registra todas las rutas de la aplicación: autenticación (log), bug-report
// público y el subgrupo /api/v1/ con usuario, contactos, chat, media, llamadas y WebSocket.
func Router(handlerLog handlers.HandlerUser, app *gin.Engine, handlerApi handlers.HandlerContact, handlerChat handlers.HandlerChat, handlerCall *handlers.HandlerCall, hub *websocket.Hub, chatService services.ChatServicer, contactService services.ContactServicer, handlerBugReport *handlers.HandlerBugReport, callService services.CallServicer, handlerMedia *handlers.HandlerMedia) {
	// Middleware de recuperación de panics
	app.Use(gin.Recovery())

	// Rutas de autenticación
	router := log.Log{Router: app, Handler: handlerLog}
	router.Logs()

	// Ruta pública para reportes de bugs (no requiere autenticación)
	app.POST("/api/v1/bug-report", middleware.MiddlewareBugReport(), handlerBugReport.HandleReportBug())

	subrouter := app.Group("/api/v1/")
	apiMessage := api.InitRouterApiMessage(subrouter, &handlerApi, &handlerChat, handlerCall, handlerMedia, hub, chatService, contactService, callService)
	apiMessage.ApiUser()
	apiMessage.ApiContact()
	apiMessage.ApiChat()
	apiMessage.ApiMedia()
	apiMessage.ApiCall()
	apiMessage.ApiWebSocket()
}
