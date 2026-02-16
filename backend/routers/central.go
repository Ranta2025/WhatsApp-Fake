package routers

import (
	"gorm/backend/handlers"
	"gorm/backend/routers/api"
	"gorm/backend/routers/log"
	"gorm/backend/services"
	"gorm/backend/websocket"

	"github.com/gin-gonic/gin"
)

func Router(handlerLog handlers.HandlerUser, app *gin.Engine, handlerApi handlers.HandlerContact, handlerChat handlers.HandlerChat, hub *websocket.Hub, chatService *services.ServiceChat, contactService *services.ServiceApiContact, handlerBugReport *handlers.HandlerBugReport) {
	// Middleware de recuperación de panics
	app.Use(gin.Recovery())

	// Rutas de autenticación
	router := log.Log{Router: app, Handler: handlerLog}
	router.Logs()

	// Ruta pública para reportes de bugs (no requiere autenticación)
	app.POST("/api/v1/bug-report", handlerBugReport.HandleReportBug())

	subrouter := app.Group("/api/v1/")
	apiMessage := api.InitRouterApiMessage(subrouter, &handlerApi, &handlerChat, hub, chatService, contactService)
	apiMessage.ApiUser()
	apiMessage.ApiContact()
	apiMessage.ApiChat()
	apiMessage.ApiWebSocket()
}
