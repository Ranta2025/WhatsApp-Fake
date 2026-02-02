package routers

import (
	"gorm/backend/handlers"
	"gorm/backend/middleware"
	"gorm/backend/routers/api"
	"gorm/backend/routers/log"

	"github.com/gin-gonic/gin"
)

func Router(handlerLog handlers.HandlerUser, app *gin.Engine, handlerApi handlers.HandlerContact, handlerChat handlers.HandlerChat, handlerWS *handlers.HandlerWebSocket) {
	// Middleware de recuperación de panics
	app.Use(gin.Recovery())

	// Rutas de autenticación
	router := log.Log{Router: app, Handler: handlerLog}
	router.Logs()

	// WebSocket - ruta protegida con token
	app.GET("/ws", middleware.MiddlewareWebSocketAuth(), handlerWS.HandlerWSConnect())

	// Rutas API v1
	subrouter := app.Group("/api/v1/")
	apiMessage := api.InitRouterApiMessage(subrouter, &handlerApi, &handlerChat)
	apiMessage.ApiUser()
	apiMessage.ApiContact()
	apiMessage.ApiChat()
}
