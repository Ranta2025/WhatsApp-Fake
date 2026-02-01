package routers

import (
	"gorm/backend/handlers"
	"gorm/backend/routers/api"
	"gorm/backend/routers/log"

	"github.com/gin-gonic/gin"
)

func Router(handlerLog handlers.HandlerUser, app *gin.Engine, handlerApi handlers.HandlerContact, handlerChat handlers.HandlerChat) {
	// Middleware de recuperación de panics
	app.Use(gin.Recovery())
	
	router := log.Log{Router: app,Handler: handlerLog,}
	router.Logs()
	subrouter := app.Group("/api/v1/")
	apiMessage := api.InitRouterApiMessage(subrouter, &handlerApi, &handlerChat)
	apiMessage.ApiUser()
	apiMessage.ApiContact()
	apiMessage.ApiChat()
}