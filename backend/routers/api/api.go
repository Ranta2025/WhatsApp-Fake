package api

import (
	"gorm/backend/handlers"
	"gorm/backend/middleware"
	"gorm/backend/models"
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
	handlerStatus  *handlers.HandlerStatus
	handlerSearch  *handlers.HandlerSearch
	handlerPush    *handlers.HandlerPush
	hub            *websocket.Hub
	chatService    services.ChatServicer
	contactService services.ContactServicer
	callService    services.CallServicer
	groupService   services.GroupServicer
}

// InitRouterApiMessage inicializa el subrouter /api/v1/ con todos los handlers
// y aplica el middleware de validación de token JWT.
func InitRouterApiMessage(app *gin.RouterGroup, handler *handlers.HandlerContact, handlerChat *handlers.HandlerChat, handlerCall *handlers.HandlerCall, handlerMedia *handlers.HandlerMedia, handlerGroup *handlers.HandlerGroup, handlerStatus *handlers.HandlerStatus, handlerSearch *handlers.HandlerSearch, hub *websocket.Hub, chatService services.ChatServicer, contactService services.ContactServicer, callService services.CallServicer, groupService services.GroupServicer) *RouterApiMessage {
	rout := &RouterApiMessage{
		app:            app,
		handlerContact: handler,
		handlerChat:    handlerChat,
		handlerCall:    handlerCall,
		handlerMedia:   handlerMedia,
		handlerGroup:   handlerGroup,
		handlerStatus:  handlerStatus,
		handlerSearch:  handlerSearch,
		hub:            hub,
		chatService:    chatService,
		contactService: contactService,
		callService:    callService,
		groupService:   groupService,
	}
	rout.app.Use(middleware.MiddlewareTokenWithTelephon())
	return rout
}

// SetHandlerPush asigna el handler de Web Push (se inyecta aparte para no
// alargar aún más la firma posicional de InitRouterApiMessage).
func (rt *RouterApiMessage) SetHandlerPush(h *handlers.HandlerPush) {
	rt.handlerPush = h
}

// ApiPush registra las rutas de Web Push (protegidas por el token del grupo):
// configuración pública, alta/baja de la suscripción del navegador y la
// preferencia de preview. Sin handler (push no cableado) no registra nada.
func (rt *RouterApiMessage) ApiPush() {
	if rt.handlerPush == nil {
		return
	}
	rt.app.GET("push/config", rt.handlerPush.HandlerGetPushConfig())
	rt.app.POST("push/subscribe", middleware.MiddlewarePushSubscribe(), rt.handlerPush.HandlerSubscribe())
	rt.app.DELETE("push/subscribe", middleware.MiddlewarePushUnsubscribe(), rt.handlerPush.HandlerUnsubscribe())
	rt.app.PUT("push/preview", middleware.MiddlewarePushPreview(), rt.handlerPush.HandlerSetPreview())
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
	rt.app.GET("chat/:contact/search", middleware.MiddlewateGetChat(), rt.handlerChat.HandlerSearchChat())
	rt.app.PUT("chat/:contact/disappearing", middleware.MiddlewateGetChat(), rt.handlerChat.HandlerSetDisappearing())
	rt.app.GET("chat/:contact/settings", middleware.MiddlewateGetChat(), rt.handlerChat.HandlerGetChatSettings())
	rt.app.GET("chats", rt.handlerChat.HandlerGetAllChats())
	rt.app.PUT("chat/:contact", middleware.MiddlewareChatPutStatus(), rt.handlerChat.HandlerPutChat())
	rt.app.PUT("chat", rt.handlerChat.HandlerPutAllChat())
	rt.app.PUT("chat/edit", middleware.MiddlewareChatEdit(), rt.handlerChat.HandlerEditMessage())
	rt.app.DELETE("chat/:contact", middleware.MiddlewareClearChat(), rt.handlerChat.HandlerClearChat())
	rt.app.DELETE("message/:id/me", middleware.MiddlewareDeleteMessage(), rt.handlerChat.HandlerDeleteMessageForMe())

	// Reacciones 1:1 (espejo REST del evento WS `react`)
	if hr := rt.reactionHandler(); hr != nil {
		const kind = models.ReactionKindDirect
		rt.app.PUT("chat/message/:id/reaction", middleware.MiddlewareDeleteMessage(), hr.HandlerSetReaction(kind))
		rt.app.DELETE("chat/message/:id/reaction", middleware.MiddlewareDeleteMessage(), hr.HandlerRemoveReaction(kind))
		rt.app.GET("chat/message/:id/reactions", middleware.MiddlewareDeleteMessage(), hr.HandlerListReactions(kind))
	}
}

// reactionHandler construye el handler REST de reacciones con el servicio que
// comparte el hub con el handler WS; nil si no hay servicio (tests).
func (rt *RouterApiMessage) reactionHandler() *handlers.HandlerReaction {
	if rt.hub == nil || rt.hub.Reactions() == nil {
		return nil
	}
	return handlers.InitHandlerReaction(rt.hub.Reactions(), rt.hub)
}

// ApiSearch registra la búsqueda global de mensajes (chats 1:1 y grupos).
func (rt *RouterApiMessage) ApiSearch() {
	rt.app.GET("search", rt.handlerSearch.HandlerSearchAll())
}

// ApiMedia registra la ruta de subida de archivos multimedia.
func (rt *RouterApiMessage) ApiMedia() {
	rt.app.POST("upload", rt.handlerMedia.HandlerUploadMedia())
}

// ApiStatus registra las rutas del feature de "Estados" (stories): publicar,
// listar el feed (propios + contactos mutuos), marcar como visto, listar
// espectadores de un estado propio y borrarlo.
func (rt *RouterApiMessage) ApiStatus() {
	rt.app.POST("status", middleware.MiddlewareStatusCreate(), rt.handlerStatus.HandlerCreateStatus())
	rt.app.GET("status", rt.handlerStatus.HandlerGetStatusFeed())
	rt.app.POST("status/:id/view", middleware.MiddlewareStatusID(), rt.handlerStatus.HandlerMarkStatusViewed())
	rt.app.GET("status/:id/views", middleware.MiddlewareStatusID(), rt.handlerStatus.HandlerGetStatusViewers())
	rt.app.DELETE("status/:id", middleware.MiddlewareStatusID(), rt.handlerStatus.HandlerDeleteStatus())
}

// ApiCall registra las rutas del sistema de llamadas (token ZegoCloud, historial, eliminar).
func (rt *RouterApiMessage) ApiCall() {
	rt.app.GET("call/token/:roomID", middleware.MiddlewareCallToken(), rt.handlerCall.GenerateToken())
	rt.app.GET("call/history", rt.handlerCall.GetCallHistory())
	rt.app.DELETE("call/:id", middleware.MiddlewareDeleteCallLog(), rt.handlerCall.DeleteCallLog())
}

// ApiGroup registra todas las rutas del dominio de grupos de chat.
//
//	POST   /api/v1/group                           → crear grupo
//	GET    /api/v1/group                           → mis grupos
//	GET    /api/v1/group/:groupID                  → detalle del grupo
//	POST   /api/v1/group/:groupID/members          → añadir miembros
//	PUT    /api/v1/group/:groupID/members/:telephon/role → designar/descartar admin
//	DELETE /api/v1/group/:groupID/members/:telephon → eliminar miembro
//	DELETE /api/v1/group/:groupID/member           → salir del grupo (self)
//	PATCH  /api/v1/group/:groupID/settings         → configuración de permisos
//	PATCH  /api/v1/group/:groupID                  → nombre/descripción
//	PUT    /api/v1/group/:groupID/disappearing     → temporizador de mensajes temporales
//	POST   /api/v1/group/:groupID/message          → enviar mensaje
//	GET    /api/v1/group/:groupID/message          → historial (paginado)
//	PUT    /api/v1/group/:groupID/message          → editar mensaje
//	DELETE /api/v1/group/:groupID/message          → eliminar mensaje
//	GET    /api/v1/group/:groupID/message/search → buscar mensajes (solo miembros)
//	GET    /api/v1/group/:groupID/message/:messageID/receipts → acuses (solo el autor)
//	PUT    /api/v1/group/:groupID/message/:messageID/reaction  → reaccionar {emoji}
//	DELETE /api/v1/group/:groupID/message/:messageID/reaction  → quitar la reacción
//	GET    /api/v1/group/:groupID/message/:messageID/reactions → quién reaccionó
func (rt *RouterApiMessage) ApiGroup() {
	g := rt.app.Group("group")
	{
		// Recursos de grupo
		g.POST("", middleware.MiddlewareGroupCreate(), rt.handlerGroup.HandleCreateGroup())
		g.GET("", rt.handlerGroup.HandleGetUserGroups())
		g.GET("/:groupID", middleware.MiddlewareGroupID(), rt.handlerGroup.HandleGetGroupDetail())

		// Miembros
		g.POST("/:groupID/members", middleware.MiddlewareGroupID(), middleware.MiddlewareGroupAddMembers(), rt.handlerGroup.HandleAddMembers())
		g.PUT("/:groupID/members/:telephon/role", middleware.MiddlewareGroupID(), middleware.MiddlewareGroupTelephon(), middleware.MiddlewareGroupMemberRole(), rt.handlerGroup.HandleChangeMemberRole())
		g.DELETE("/:groupID/members/:telephon", middleware.MiddlewareGroupID(), middleware.MiddlewareGroupTelephon(), rt.handlerGroup.HandleRemoveMember())
		g.DELETE("/:groupID/member", middleware.MiddlewareGroupID(), rt.handlerGroup.HandleLeaveGroup())
		g.PATCH("/:groupID/avatar", middleware.MiddlewareGroupID(), rt.handlerGroup.HandleUpdateGroupAvatar())
		g.PATCH("/:groupID/settings", middleware.MiddlewareGroupID(), middleware.MiddlewareGroupSettings(), rt.handlerGroup.HandleUpdateGroupSettings())
		g.PATCH("/:groupID", middleware.MiddlewareGroupID(), middleware.MiddlewareGroupInfo(), rt.handlerGroup.HandleUpdateGroupInfo())
		g.PUT("/:groupID/disappearing", middleware.MiddlewareGroupID(), rt.handlerGroup.HandleSetDisappearing())

		// Mensajes de grupo
		g.POST("/:groupID/message", middleware.MiddlewareGroupID(), middleware.MiddlewareGroupMessage(), rt.handlerGroup.HandleSendGroupMessage())
		g.GET("/:groupID/message", middleware.MiddlewareGroupID(), rt.handlerGroup.HandleGetGroupMessages())
		g.PUT("/:groupID/message", middleware.MiddlewareGroupID(), middleware.MiddlewareGroupMessageEdit(), rt.handlerGroup.HandleEditGroupMessage())
		g.GET("/:groupID/message/search", middleware.MiddlewareGroupID(), rt.handlerGroup.HandleSearchGroupMessages())
		g.GET("/:groupID/message/:messageID/receipts", middleware.MiddlewareGroupID(), middleware.MiddlewareGroupMessageID(), rt.handlerGroup.HandleGetMessageReceipts())
		g.DELETE("/:groupID/message", middleware.MiddlewareGroupID(), middleware.MiddlewareGroupMessageDelete(), rt.handlerGroup.HandleDeleteGroupMessage())

		// Reacciones de grupo
		if hr := rt.reactionHandler(); hr != nil {
			const kind = models.ReactionKindGroup
			g.PUT("/:groupID/message/:messageID/reaction", middleware.MiddlewareGroupID(), middleware.MiddlewareGroupMessageID(), hr.HandlerSetReaction(kind))
			g.DELETE("/:groupID/message/:messageID/reaction", middleware.MiddlewareGroupID(), middleware.MiddlewareGroupMessageID(), hr.HandlerRemoveReaction(kind))
			g.GET("/:groupID/message/:messageID/reactions", middleware.MiddlewareGroupID(), middleware.MiddlewareGroupMessageID(), hr.HandlerListReactions(kind))
		}
	}
}
