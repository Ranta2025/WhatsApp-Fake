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
	handlerGroup   *handlers.HandlerGroup
	hub            *websocket.Hub
	chatService    services.ChatServicer
	contactService services.ContactServicer
	callService    services.CallServicer
	groupService   services.GroupServicer
}

// InitRouterApiMessage inicializa el subrouter /api/v1/ con todos los handlers
// y aplica el middleware de validación de token JWT.
func InitRouterApiMessage(app *gin.RouterGroup, handler *handlers.HandlerContact, handlerChat *handlers.HandlerChat, handlerCall *handlers.HandlerCall, handlerMedia *handlers.HandlerMedia, handlerGroup *handlers.HandlerGroup, hub *websocket.Hub, chatService services.ChatServicer, contactService services.ContactServicer, callService services.CallServicer, groupService services.GroupServicer) *RouterApiMessage {
	rout := &RouterApiMessage{
		app:            app,
		handlerContact: handler,
		handlerChat:    handlerChat,
		handlerCall:    handlerCall,
		handlerMedia:   handlerMedia,
		handlerGroup:   handlerGroup,
		hub:            hub,
		chatService:    chatService,
		contactService: contactService,
		callService:    callService,
		groupService:   groupService,
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
	rt.app.GET("ws", websocket.HandleWebSocket(rt.hub, rt.chatService, rt.contactService, rt.callService, rt.groupService))
}

// ApiGroup registra todas las rutas del dominio de grupos de chat.
//
//	POST   /api/v1/group                           → crear grupo
//	GET    /api/v1/group                           → mis grupos
//	GET    /api/v1/group/:groupID                  → detalle del grupo
//	POST   /api/v1/group/:groupID/members          → añadir miembros
//	POST   /api/v1/group/:groupID/message          → enviar mensaje
//	GET    /api/v1/group/:groupID/message          → historial (paginado)
//	PUT    /api/v1/group/:groupID/message          → editar mensaje
//	DELETE /api/v1/group/:groupID/message          → eliminar mensaje
func (rt *RouterApiMessage) ApiGroup() {
	g := rt.app.Group("group")
	{
		// Recursos de grupo
		g.POST("", middleware.MiddlewareGroupCreate(), rt.handlerGroup.HandleCreateGroup())
		g.GET("", rt.handlerGroup.HandleGetUserGroups())
		g.GET("/:groupID", middleware.MiddlewareGroupID(), rt.handlerGroup.HandleGetGroupDetail())

		// Miembros
		g.POST("/:groupID/members", middleware.MiddlewareGroupID(), middleware.MiddlewareGroupAddMembers(), rt.handlerGroup.HandleAddMembers())
		g.DELETE("/:groupID/member", middleware.MiddlewareGroupID(), rt.handlerGroup.HandleLeaveGroup())
		g.PATCH("/:groupID/avatar", middleware.MiddlewareGroupID(), rt.handlerGroup.HandleUpdateGroupAvatar())

		// Mensajes de grupo
		g.POST("/:groupID/message", middleware.MiddlewareGroupID(), middleware.MiddlewareGroupMessage(), rt.handlerGroup.HandleSendGroupMessage())
		g.GET("/:groupID/message", middleware.MiddlewareGroupID(), rt.handlerGroup.HandleGetGroupMessages())
		g.PUT("/:groupID/message", middleware.MiddlewareGroupID(), middleware.MiddlewareGroupMessageEdit(), rt.handlerGroup.HandleEditGroupMessage())
		g.DELETE("/:groupID/message", middleware.MiddlewareGroupID(), middleware.MiddlewareGroupMessageDelete(), rt.handlerGroup.HandleDeleteGroupMessage())
	}
}
