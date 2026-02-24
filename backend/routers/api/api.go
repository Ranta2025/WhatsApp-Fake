package api

import (
	"gorm/backend/handlers"
	"gorm/backend/middleware"
	"gorm/backend/services"
	"gorm/backend/websocket"

	"github.com/gin-gonic/gin"
)

type RouterApiMessage struct {
	app            *gin.RouterGroup
	handlerContact *handlers.HandlerContact
	handlerChat    *handlers.HandlerChat
	hub            *websocket.Hub
	chatService    *services.ServiceChat
	contactService *services.ServiceApiContact
}

func InitRouterApiMessage(app *gin.RouterGroup, handler *handlers.HandlerContact, handlerChat *handlers.HandlerChat, hub *websocket.Hub, chatService *services.ServiceChat, contactService *services.ServiceApiContact) *RouterApiMessage {
	rout := &RouterApiMessage{
		app:            app,
		handlerContact: handler,
		handlerChat:    handlerChat,
		hub:            hub,
		chatService:    chatService,
		contactService: contactService,
	}
	rout.app.Use(middleware.MiddlewareTokenWithTelephon())
	return rout
}

func (rt *RouterApiMessage) ApiUser() {
	rt.app.GET("user", rt.handlerContact.HandlerGetUser())
	rt.app.PUT("user", middleware.MiddlewareUsername(), rt.handlerContact.HandlerPutUser())
}

func (rt *RouterApiMessage) ApiContact() {
	rt.app.POST("contact", middleware.MiddlewareContact(), rt.handlerContact.HandlerAddContact())
	rt.app.GET("contact", rt.handlerContact.HandlerContacts())
	rt.app.PUT("contact", middleware.MiddlewarePutContact(), rt.handlerContact.HandlerPutContact())
}
func (rt *RouterApiMessage) ApiChat() {
	rt.app.POST("chat", middleware.MiddlewareChat(), rt.handlerChat.HandlerPostChat())
	rt.app.GET("chat/:contact", middleware.MiddlewateGetChat(), rt.handlerChat.HandlerGetChats())
	rt.app.GET("chats", rt.handlerChat.HandlerGetAllChats())
	rt.app.PUT("chat/:contact", middleware.MiddlewareChatPutStatus(), rt.handlerChat.HandlerPutChat())
	rt.app.PUT("chat", rt.handlerChat.HandlerPutAllChat())
	rt.app.PUT("chat/edit", middleware.MiddlewareChatEdit(), rt.handlerChat.HandlerEditMessage())
}

func (rt *RouterApiMessage) ApiWebSocket() {
	rt.app.GET("ws", websocket.HandleWebSocket(rt.hub, rt.chatService, rt.contactService))
}
