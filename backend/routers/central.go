package routers

import (
	"gorm/backend/handlers"
	"gorm/backend/routers/api"
	"gorm/backend/routers/log"
	"gorm/backend/services"
	"gorm/backend/websocket"

	"github.com/gin-gonic/gin"
)

func Router(handlerLog handlers.HandlerUser, app *gin.Engine, handlerApi handlers.HandlerContact, handlerChat handlers.HandlerChat, hub *websocket.Hub, chatService *services.ServiceChat) {
	// Middleware de recuperación de panics
	app.Use(gin.Recovery())

	// Rutas de autenticación
	router := log.Log{Router: app, Handler: handlerLog}
	router.Logs()
	subrouter := app.Group("/api/v1/")
	apiMessage := api.InitRouterApiMessage(subrouter, &handlerApi, &handlerChat, hub, chatService)
	apiMessage.ApiUser()
	apiMessage.ApiContact()
	apiMessage.ApiChat()
	apiMessage.ApiWebSocket()
}
