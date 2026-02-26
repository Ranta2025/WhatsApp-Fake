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
	handlerCall    *handlers.HandlerCall
	handlerMedia   *handlers.HandlerMedia
	hub            *websocket.Hub
	chatService    *services.ServiceChat
	contactService *services.ServiceApiContact
	callService    *services.ServiceCall
}

// InitRouterApiMessage inicializa el subrouter /api/v1/ con todos los handlers
// y aplica el middleware de validación de token JWT.
func InitRouterApiMessage(app *gin.RouterGroup, handler *handlers.HandlerContact, handlerChat *handlers.HandlerChat, handlerCall *handlers.HandlerCall, handlerMedia *handlers.HandlerMedia, hub *websocket.Hub, chatService *services.ServiceChat, contactService *services.ServiceApiContact, callService *services.ServiceCall) *RouterApiMessage {
	rout := &RouterApiMessage{
		app:            app,
		handlerContact: handler,
		handlerChat:    handlerChat,
		handlerCall:    handlerCall,
		handlerMedia:   handlerMedia,
		hub:            hub,
		chatService:    chatService,
		contactService: contactService,
		callService:    callService,
	}
	rout.app.Use(middleware.MiddlewareTokenWithTelephon())
	return rout
}

// ApiUser registra las rutas de gestión de perfil del usuario autenticado.
func (rt *RouterApiMessage) ApiUser() {
	rt.app.GET("user", rt.handlerContact.HandlerGetUser())
	rt.app.PUT("user", middleware.MiddlewareUsername(), rt.handlerContact.HandlerPutUser())
	rt.app.PUT("profile/avatar", middleware.MiddlewareUpdateAvatar(), rt.handlerContact.HandlerUpdateAvatar())
	rt.app.PUT("profile/wallpaper", rt.handlerContact.HandlerUpdateWallpaper())
	rt.app.PUT("contact/wallpaper", rt.handlerContact.HandlerUpdateContactWallpaper())
}

// ApiContact registra las rutas de gestión de contactos.
func (rt *RouterApiMessage) ApiContact() {
	rt.app.POST("contact", middleware.MiddlewareContact(), rt.handlerContact.HandlerAddContact())
	rt.app.GET("contact", rt.handlerContact.HandlerContacts())
	rt.app.PUT("contact", middleware.MiddlewarePutContact(), rt.handlerContact.HandlerPutContact())
}

// ApiChat registra las rutas del sistema de mensajería.
func (rt *RouterApiMessage) ApiChat() {
	rt.app.POST("chat", middleware.MiddlewareChat(), rt.handlerChat.HandlerPostChat())
	rt.app.GET("chat/:contact", middleware.MiddlewateGetChat(), rt.handlerChat.HandlerGetChats())
	rt.app.GET("chats", rt.handlerChat.HandlerGetAllChats())
	rt.app.PUT("chat/:contact", middleware.MiddlewareChatPutStatus(), rt.handlerChat.HandlerPutChat())
	rt.app.PUT("chat", rt.handlerChat.HandlerPutAllChat())
	rt.app.PUT("chat/edit", middleware.MiddlewareChatEdit(), rt.handlerChat.HandlerEditMessage())
	rt.app.DELETE("chat/:contact", middleware.MiddlewareClearChat(), rt.handlerChat.HandlerClearChat())
	rt.app.DELETE("message/:id/me", middleware.MiddlewareDeleteMessage(), rt.handlerChat.HandlerDeleteMessageForMe())
}

// ApiMedia registra la ruta de subida de archivos multimedia.
func (rt *RouterApiMessage) ApiMedia() {
	rt.app.POST("upload", rt.handlerMedia.HandlerUploadMedia())
}

// ApiCall registra las rutas del sistema de llamadas (token ZegoCloud, historial, eliminar).
func (rt *RouterApiMessage) ApiCall() {
	rt.app.GET("call/token/:roomID", middleware.MiddlewareCallToken(), rt.handlerCall.GenerateToken())
	rt.app.GET("call/history", rt.handlerCall.GetCallHistory())
	rt.app.DELETE("call/:id", middleware.MiddlewareDeleteCallLog(), rt.handlerCall.DeleteCallLog())
}

// ApiWebSocket registra la ruta del WebSocket para comunicación en tiempo real.
func (rt *RouterApiMessage) ApiWebSocket() {
	rt.app.GET("ws", websocket.HandleWebSocket(rt.hub, rt.chatService, rt.contactService, rt.callService))
}
