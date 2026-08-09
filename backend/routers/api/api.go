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
	handlerStatus  *handlers.HandlerStatus
	hub            *websocket.Hub
	chatService    services.ChatServicer
	contactService services.ContactServicer
	callService    services.CallServicer
	groupService   services.GroupServicer
}

func InitRouterApiMessage(app *gin.RouterGroup, handler *handlers.HandlerContact, handlerChat *handlers.HandlerChat, handlerCall *handlers.HandlerCall, handlerMedia *handlers.HandlerMedia, handlerGroup *handlers.HandlerGroup, handlerStatus *handlers.HandlerStatus, hub *websocket.Hub, chatService services.ChatServicer, contactService services.ContactServicer, callService services.CallServicer, groupService services.GroupServicer) *RouterApiMessage {
	rout := &RouterApiMessage{
		app:            app,
		handlerContact: handler,
		handlerChat:    handlerChat,
		handlerCall:    handlerCall,
		handlerMedia:   handlerMedia,
		handlerGroup:   handlerGroup,
		handlerStatus:  handlerStatus,
		hub:            hub,
		chatService:    chatService,
		contactService: contactService,
		callService:    callService,
		groupService:   groupService,
	}
	rout.app.Use(middleware.MiddlewareTokenWithTelephon())
	return rout
}

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

func (rt *RouterApiMessage) ApiChat() {
	rt.app.POST("chat",
		middleware.RateLimitByUser("send_msg", 60, time.Minute),
		middleware.MiddlewareChat(),
		rt.handlerChat.HandlerPostChat())

	rt.app.GET("chat/:contact",
		middleware.RateLimitByUser("get_chat", 30, time.Minute),
		middleware.MiddlewareGetChat(),
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

func (rt *RouterApiMessage) ApiMedia() {
	rt.app.POST("upload",
		middleware.RateLimitByUser("upload_media", 20, time.Minute),
		rt.handlerMedia.HandlerUploadMedia())
}

func (rt *RouterApiMessage) ApiStatus() {
	s := rt.app.Group("status")
	{
		s.GET("",
			middleware.RateLimitByUser("get_status_feed", 30, time.Minute),
			rt.handlerStatus.HandleGetFeed())

		s.POST("",
			middleware.RateLimitByUser("create_status", 15, time.Minute),
			middleware.MiddlewareStatusCreate(),
			rt.handlerStatus.HandleCreateStatus())

		s.PUT("/:statusID/view",
			middleware.RateLimitByUser("view_status", 60, time.Minute),
			rt.handlerStatus.HandleMarkViewed())

		s.DELETE("/:statusID",
			middleware.RateLimitByUser("delete_status", 20, time.Minute),
			rt.handlerStatus.HandleDeleteStatus())
	}
}

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

func (rt *RouterApiMessage) ApiWebSocket() {
	rt.app.GET("ws", websocket.HandleWebSocket(rt.hub, rt.chatService, rt.contactService, rt.callService, rt.groupService))
}

func (rt *RouterApiMessage) ApiGroup() {
	g := rt.app.Group("group")
	{
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

		g.POST("/:groupID/members",
			middleware.RateLimitByUser("add_group_members", 10, time.Minute),
			middleware.MiddlewareGroupID(),
			middleware.MiddlewareGroupAddMembers(),
			rt.handlerGroup.HandleAddMembers())

		g.DELETE("/:groupID/members",
			middleware.RateLimitByUser("remove_group_member", 10, time.Minute),
			middleware.MiddlewareGroupID(),
			middleware.MiddlewareGroupRemoveMember(),
			rt.handlerGroup.HandleRemoveMember())

		g.DELETE("/:groupID/member",
			middleware.RateLimitByUser("leave_group", 10, time.Minute),
			middleware.MiddlewareGroupID(),
			rt.handlerGroup.HandleLeaveGroup())

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
