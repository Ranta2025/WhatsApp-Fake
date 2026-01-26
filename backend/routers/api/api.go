package api

import (
	"gorm/backend/handlers"
	"gorm/backend/middleware"

	"github.com/gin-gonic/gin"
)

type RouterApiMessage struct {
	app *gin.RouterGroup
	handler *handlers.HandlerContact
}

func InitRouterApiMessage(app *gin.RouterGroup, handler *handlers.HandlerContact) *RouterApiMessage{
	rout := &RouterApiMessage{
		app: app,
		handler: handler,
	}
	rout.app.Use(middleware.MiddlewareTokenValidation())
	return rout
}


func (rt *RouterApiMessage) ApiUser(){
	rt.app.GET("user", rt.handler.HandlerGetUser())
	rt.app.PUT("user", middleware.MiddlewareUsername(), rt.handler.HandlerPutUser())
}

func (rt *RouterApiMessage) ApiContact(){
	rt.app.POST("contact",middleware.MiddlewareContact(),rt.handler.HandlerAddContact())
	rt.app.GET("contact",rt.handler.HandlerContacts())
	rt.app.PUT("contact",middleware.MiddlewareContactPut(), rt.handler.ContactPut())
}


