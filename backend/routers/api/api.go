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
	rout.app.Use(middleware.MiddlewareTokenValidation())
	return rout
}

func (rt *RouterApiMessage) ApiUser() {
	rt.app.GET("user", rt.handlerContact.HandlerGetUser())
	rt.app.PUT("user", middleware.MiddlewareUsername(), rt.handlerContact.HandlerPutUser())
}

func (rt *RouterApiMessage) ApiContact() {
	rt.app.POST("contact", middleware.MiddlewareContact(), rt.handlerContact.HandlerAddContact())
	rt.app.GET("contact", rt.handlerContact.HandlerContacts())
}
func (rt *RouterApiMessage) ApiChat() {
	rt.app.POST("chat", middleware.MiddlewareTokenWithTelephon(), middleware.MiddlewareChat(), rt.handlerChat.HandlerPostChat())
	rt.app.GET("chat/:contact", middleware.MiddlewareTokenWithTelephon(), middleware.MiddlewateGetChat(), rt.handlerChat.HandlerGetChats())
	rt.app.GET("chats", middleware.MiddlewareTokenWithTelephon(), rt.handlerChat.HandlerGetAllChats())
	rt.app.PUT("chat/:contact", middleware.MiddlewareTokenWithTelephon(), middleware.MiddlewareChatPutStatus(), rt.handlerChat.HandlerPutChat())
	rt.app.PUT("chat", middleware.MiddlewareTokenWithTelephon(), rt.handlerChat.HandlerPutAllChat())
}

func (rt *RouterApiMessage) ApiWebSocket() {
	// Usar el middleware con telephon para WebSocket
	rt.app.GET("ws", middleware.MiddlewareTokenWithTelephon(), websocket.HandleWebSocket(rt.hub, rt.chatService, rt.contactService))
}
