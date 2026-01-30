package api

import (
	"gorm/backend/handlers"
	"gorm/backend/middleware"

	"github.com/gin-gonic/gin"
)

type RouterApiMessage struct {
	app *gin.RouterGroup
	handlerContact *handlers.HandlerContact
	handlerChat *handlers.HandlerChat

}

func InitRouterApiMessage(app *gin.RouterGroup, handler *handlers.HandlerContact, handlerChat *handlers.HandlerChat) *RouterApiMessage{
	rout := &RouterApiMessage{
		app: app,
		handlerContact: handler,
		handlerChat: handlerChat,
	}
	rout.app.Use(middleware.MiddlewareTokenValidation())
	return rout
}


func (rt *RouterApiMessage) ApiUser(){
	rt.app.GET("user", rt.handlerContact.HandlerGetUser())
	rt.app.PUT("user", middleware.MiddlewareUsername(), rt.handlerContact.HandlerPutUser())
}

func (rt *RouterApiMessage) ApiContact(){
	rt.app.POST("contact",middleware.MiddlewareContact(),rt.handlerContact.HandlerAddContact())
	rt.app.GET("contact",rt.handlerContact.HandlerContacts())
	rt.app.PUT("contact",middleware.MiddlewareContactPut(), rt.handlerContact.ContactPut())
}
func (rt *RouterApiMessage) ApiChat(){
	rt.app.POST("chat", middleware.MiddlewareChat(), rt.handlerChat.HandlerPostChat())
	rt.app.GET("chat/:contact", middleware.MiddlewateGetChat(), rt.handlerChat.HandlerGetChats())
	rt.app.PUT("chat/:contact", middleware.MiddlewareChatPutStatus(), rt.handlerChat.HandlerPutChat())
	rt.app.PUT("chat", rt.handlerChat.HandlerPutAllChat())
}


