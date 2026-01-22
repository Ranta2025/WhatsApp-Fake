package api

import (
	"gorm/handlers"
	"gorm/middleware"

	"github.com/gin-gonic/gin"
)

type RouterApiMessage struct {
	app *gin.RouterGroup
	handler *handlers.HandlerApiMessage
}

func InitRouterApiMessage(app *gin.RouterGroup, handler *handlers.HandlerApiMessage) *RouterApiMessage{
	return &RouterApiMessage{
		app: app,
		handler: handler,
	}
}


func (rt *RouterApiMessage) GetUser(){
	rt.app.GET("user", middleware.MiddlewareTokenValidation(), rt.handler.HandlerGetUser())
}
