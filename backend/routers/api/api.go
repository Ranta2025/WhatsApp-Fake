package api

import (
	"gorm/backend/handlers"
	"gorm/backend/middleware"
	"gorm/backend/services"
	"gorm/backend/websocket"
	"time"

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
//
// Rate limits (user-based):
//
//	GET  user            60 req/min  – lectura de perfil
//	PUT  user            10 req/min  – cambio de username (costoso: regen JWT + WS broadcast)
//	PUT  profile/avatar   5 req/min  – upload a MinIO
//	PUT  profile/wallpaper 10 req/min
//	PUT  contact/wallpaper 10 req/min
func (rt *RouterApiMessage) ApiUser() {
	rt.app.GET("user",
		middleware.RateLimitByUser("get_user", 60, time.Minute),
		rt.handlerContact.HandlerGetUser())

	rt.app.PUT("user",
		middleware.RateLimitByUser("put_user", 10, time.Minute),
		middleware.MiddlewareUsername(),
		rt.handlerContact.HandlerPutUser())

	rt.app.PUT("profile/avatar",
		middleware.RateLimitByUser("put_avatar", 5, time.Minute),
		middleware.MiddlewareUpdateAvatar(),
		rt.handlerContact.HandlerUpdateAvatar())

	rt.app.PUT("profile/wallpaper",
		middleware.RateLimitByUser("put_wallpaper", 10, time.Minute),
		rt.handlerContact.HandlerUpdateWallpaper())

	rt.app.PUT("contact/wallpaper",
		middleware.RateLimitByUser("put_contact_wallpaper", 10, time.Minute),
		rt.handlerContact.HandlerUpdateContactWallpaper())
}

// ApiContact registra las rutas de gestión de contactos.
//
// Rate limits (user-based):
//
//	POST contact  10 req/min – agregar contactos (acción deliberada, poco frecuente)
//	GET  contact  60 req/min – lectura de lista
//	PUT  contact  20 req/min – renombrar alias
func (rt *RouterApiMessage) ApiContact() {
	rt.app.POST("contact",
		middleware.RateLimitByUser("add_contact", 10, time.Minute),
		middleware.MiddlewareContact(),
		rt.handlerContact.HandlerAddContact())

	rt.app.GET("contact",
		middleware.RateLimitByUser("get_contacts", 60, time.Minute),
		rt.handlerContact.HandlerContacts())

	rt.app.PUT("contact",
		middleware.RateLimitByUser("put_contact", 20, time.Minute),
		middleware.MiddlewarePutContact(),
		rt.handlerContact.HandlerPutContact())
}

// ApiChat registra las rutas del sistema de mensajería.
//
// Rate limits (user-based):
//
//	POST   chat             60 req/min  – enviar mensaje (límite holgado, mensajería real)
//	GET    chat/:contact     30 req/min  – cargar historial de conversación
//	GET    chats             30 req/min  – cargar lista de chats (se llama al abrir el dashboard)
//	PUT    chat/:contact     60 req/min  – marcar mensajes como leídos (se dispara automáticamente)
//	PUT    chat              30 req/min  – marcar todos los chats como leídos
//	PUT    chat/edit         30 req/min  – editar mensaje
//	DELETE chat/:contact     10 req/min  – borrar conversación completa (acción destructiva)
//	DELETE message/:id/me    30 req/min  – borrar mensaje para mí
func (rt *RouterApiMessage) ApiChat() {
	rt.app.POST("chat",
		middleware.RateLimitByUser("send_msg", 60, time.Minute),
		middleware.MiddlewareChat(),
		rt.handlerChat.HandlerPostChat())

	rt.app.GET("chat/:contact",
		middleware.RateLimitByUser("get_chat", 30, time.Minute),
		middleware.MiddlewateGetChat(),
		rt.handlerChat.HandlerGetChats())

	rt.app.GET("chats",
		middleware.RateLimitByUser("get_chats", 30, time.Minute),
		rt.handlerChat.HandlerGetAllChats())

	rt.app.PUT("chat/:contact",
		middleware.RateLimitByUser("mark_read", 60, time.Minute),
		middleware.MiddlewareChatPutStatus(),
		rt.handlerChat.HandlerPutChat())

	rt.app.PUT("chat",
		middleware.RateLimitByUser("mark_all_read", 30, time.Minute),
		rt.handlerChat.HandlerPutAllChat())

	rt.app.PUT("chat/edit",
		middleware.RateLimitByUser("edit_msg", 30, time.Minute),
		middleware.MiddlewareChatEdit(),
		rt.handlerChat.HandlerEditMessage())

	rt.app.DELETE("chat/:contact",
		middleware.RateLimitByUser("clear_chat", 10, time.Minute),
		middleware.MiddlewareClearChat(),
		rt.handlerChat.HandlerClearChat())

	rt.app.DELETE("message/:id/me",
		middleware.RateLimitByUser("del_msg_me", 30, time.Minute),
		middleware.MiddlewareDeleteMessage(),
		rt.handlerChat.HandlerDeleteMessageForMe())
}

// ApiMedia registra la ruta de subida de archivos multimedia.
//
// Rate limit (user-based):
//
//	POST upload  20 req/min – cada upload es costoso (MinIO + CPU para thumbnails)
func (rt *RouterApiMessage) ApiMedia() {
	rt.app.POST("upload",
		middleware.RateLimitByUser("upload_media", 20, time.Minute),
		rt.handlerMedia.HandlerUploadMedia())
}

// ApiCall registra las rutas del sistema de llamadas (token ZegoCloud, historial, eliminar).
//
// Rate limits (user-based):
//
//	GET call/token/:roomID  10 req/min  – genera token ZegoCloud (llamada externa)
//	GET call/history        30 req/min  – lectura de historial
//	DELETE call/:id         20 req/min  – borrar entrada de historial
func (rt *RouterApiMessage) ApiCall() {
	rt.app.GET("call/token/:roomID",
		middleware.RateLimitByUser("call_token", 10, time.Minute),
		middleware.MiddlewareCallToken(),
		rt.handlerCall.GenerateToken())

	rt.app.GET("call/history",
		middleware.RateLimitByUser("call_history", 30, time.Minute),
		rt.handlerCall.GetCallHistory())

	rt.app.DELETE("call/:id",
		middleware.RateLimitByUser("del_call_log", 20, time.Minute),
		middleware.MiddlewareDeleteCallLog(),
		rt.handlerCall.DeleteCallLog())
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
		// Rate limits (user-based):
		//   POST   group                  5 req/min  – crear grupo (acción ocasional)
		//   GET    group                 30 req/min  – listar mis grupos
		//   GET    group/:id             30 req/min  – detalle del grupo
		//   POST   group/:id/members     10 req/min  – añadir miembros
		//   DELETE group/:id/member      10 req/min  – salir del grupo
		//   PATCH  group/:id/avatar       5 req/min  – upload de avatar (MinIO)
		//   POST   group/:id/message     60 req/min  – enviar mensaje de grupo
		//   GET    group/:id/message     30 req/min  – historial de mensajes
		//   PUT    group/:id/message     30 req/min  – editar mensaje
		//   DELETE group/:id/message     30 req/min  – borrar mensaje
		g.POST("",
			middleware.RateLimitByUser("create_group", 5, time.Minute),
			middleware.MiddlewareGroupCreate(),
			rt.handlerGroup.HandleCreateGroup())

		g.GET("",
			middleware.RateLimitByUser("get_groups", 30, time.Minute),
			rt.handlerGroup.HandleGetUserGroups())

		g.GET("/:groupID",
			middleware.RateLimitByUser("get_group_detail", 30, time.Minute),
			middleware.MiddlewareGroupID(),
			rt.handlerGroup.HandleGetGroupDetail())

		// Miembros
		g.POST("/:groupID/members",
			middleware.RateLimitByUser("add_group_members", 10, time.Minute),
			middleware.MiddlewareGroupID(),
			middleware.MiddlewareGroupAddMembers(),
			rt.handlerGroup.HandleAddMembers())

		g.DELETE("/:groupID/member",
			middleware.RateLimitByUser("leave_group", 10, time.Minute),
			middleware.MiddlewareGroupID(),
			rt.handlerGroup.HandleLeaveGroup())

		// PATCH /:groupID/member/role  – promover/degradar miembro (solo admins)
		g.PATCH("/:groupID/member/role",
			middleware.RateLimitByUser("set_member_role", 20, time.Minute),
			middleware.MiddlewareGroupID(),
			middleware.MiddlewareGroupSetRole(),
			rt.handlerGroup.HandleSetMemberRole())

		g.PATCH("/:groupID/description",
			middleware.RateLimitByUser("group_description", 10, time.Minute),
			middleware.MiddlewareGroupID(),
			rt.handlerGroup.HandleUpdateGroupDescription())

		g.PATCH("/:groupID/avatar",
			middleware.RateLimitByUser("group_avatar", 5, time.Minute),
			middleware.MiddlewareGroupID(),
			rt.handlerGroup.HandleUpdateGroupAvatar())

		// Mensajes de grupo
		g.POST("/:groupID/message",
			middleware.RateLimitByUser("send_group_msg", 60, time.Minute),
			middleware.MiddlewareGroupID(),
			middleware.MiddlewareGroupMessage(),
			rt.handlerGroup.HandleSendGroupMessage())

		g.GET("/:groupID/message",
			middleware.RateLimitByUser("get_group_msgs", 30, time.Minute),
			middleware.MiddlewareGroupID(),
			rt.handlerGroup.HandleGetGroupMessages())

		g.PUT("/:groupID/message",
			middleware.RateLimitByUser("edit_group_msg", 30, time.Minute),
			middleware.MiddlewareGroupID(),
			middleware.MiddlewareGroupMessageEdit(),
			rt.handlerGroup.HandleEditGroupMessage())

		g.DELETE("/:groupID/message",
			middleware.RateLimitByUser("del_group_msg", 30, time.Minute),
			middleware.MiddlewareGroupID(),
			middleware.MiddlewareGroupMessageDelete(),
			rt.handlerGroup.HandleDeleteGroupMessage())
	}
}
