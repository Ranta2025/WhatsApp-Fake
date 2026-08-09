package handlers

import (
	"encoding/json"
	"gorm/backend/models"
	"gorm/backend/services"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

type GroupHubNotifier interface {
	SendTo(telephon string, msg []byte)
	JoinRoomByTelephon(groupID uint, telephon string)
}

type HandlerGroup struct {
	service  services.GroupServicer
	notifier GroupHubNotifier
}

func InitHandlerGroup(service services.GroupServicer, notifier GroupHubNotifier) *HandlerGroup {
	return &HandlerGroup{service: service, notifier: notifier}
}

func (h *HandlerGroup) notifyGroupMembers(groupID uint, telephons []string, exclude string, payload interface{}) {
	if h.notifier == nil {
		return
	}
	msg, err := json.Marshal(map[string]interface{}{
		"type":    "group_added",
		"payload": payload,
	})
	if err != nil {
		return
	}
	for _, tel := range telephons {
		if tel != exclude {
			h.notifier.SendTo(tel, msg)
			h.notifier.JoinRoomByTelephon(groupID, tel)
		}
	}
}

func (h *HandlerGroup) notifyAllGroupMembers(telephons []string, wsType string, payload interface{}) {
	if h.notifier == nil {
		return
	}
	msg, err := json.Marshal(map[string]interface{}{
		"type":    wsType,
		"payload": payload,
	})
	if err != nil {
		return
	}
	for _, tel := range telephons {
		h.notifier.SendTo(tel, msg)
	}
}

func (h *HandlerGroup) HandleCreateGroup() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exists := ctx.Get("telephon")
		data, exists2 := ctx.Get("groupCreate")
		if !exists || !exists2 {
			respondErrorMsg(ctx, http.StatusBadRequest, "error al obtener los datos")
			return
		}

		detail, err := h.service.CreateGroup(telephon.(string), data.(models.GroupCreate), ctx)
		if err != nil {
			respondError(ctx, http.StatusBadRequest, err)
			return
		}

		if detail != nil && len(detail.Members) > 0 {
			telephons := make([]string, 0, len(detail.Members))
			for _, m := range detail.Members {
				telephons = append(telephons, m.Telephon)
			}
			h.notifyGroupMembers(detail.ID, telephons, telephon.(string), detail.GroupResponse)
		}
		if detail != nil && h.notifier != nil {
			h.notifier.JoinRoomByTelephon(detail.ID, telephon.(string))
		}

		ctx.JSON(http.StatusCreated, gin.H{"group": detail})
	}
}

func (h *HandlerGroup) HandleGetUserGroups() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exists := ctx.Get("telephon")
		if !exists {
			respondErrorMsg(ctx, http.StatusBadRequest, "error al obtener los datos")
			return
		}

		groups, err := h.service.GetUserGroups(telephon.(string), ctx)
		if err != nil {
			respondError(ctx, http.StatusInternalServerError, err)
			return
		}
		ctx.JSON(http.StatusOK, gin.H{"groups": groups})
	}
}

func (h *HandlerGroup) HandleGetGroupDetail() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exists := ctx.Get("telephon")
		groupID, exists2 := ctx.Get("groupID")
		if !exists || !exists2 {
			respondErrorMsg(ctx, http.StatusBadRequest, "error al obtener los datos")
			return
		}

		detail, err := h.service.GetGroupDetail(telephon.(string), groupID.(uint), ctx)
		if err != nil {
			respondError(ctx, http.StatusForbidden, err)
			return
		}
		if h.notifier != nil {
			h.notifier.JoinRoomByTelephon(groupID.(uint), telephon.(string))
		}
		ctx.JSON(http.StatusOK, detail)
	}
}

func (h *HandlerGroup) HandleAddMembers() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exists := ctx.Get("telephon")
		groupID, exists2 := ctx.Get("groupID")
		data, exists3 := ctx.Get("groupAddMembers")
		if !exists || !exists2 || !exists3 {
			respondErrorMsg(ctx, http.StatusBadRequest, "error al obtener los datos")
			return
		}

		members := data.(models.GroupAddMembers).Members

		err := h.service.AddMembers(telephon.(string), groupID.(uint), data.(models.GroupAddMembers), ctx)
		if err != nil {
			respondError(ctx, http.StatusBadRequest, err)
			return
		}

		if len(members) > 0 {
			if detail, detailErr := h.service.GetGroupDetail(telephon.(string), groupID.(uint), ctx); detailErr == nil {
				h.notifyGroupMembers(groupID.(uint), members, telephon.(string), detail.GroupResponse)
			}
		}

		adderUsername, _ := h.service.GetUsernameByTelephon(telephon.(string), ctx)

		type addedEntry struct {
			Telephon string `json:"telephon"`
			Username string `json:"username"`
		}
		addedList := make([]addedEntry, 0, len(members))
		for _, tel := range members {
			username, _ := h.service.GetUsernameByTelephon(tel, ctx)
			addedList = append(addedList, addedEntry{Telephon: tel, Username: username})
		}

		allTelephons, err2 := h.service.GetMemberTelephons(groupID.(uint), ctx)
		if err2 == nil && len(allTelephons) > 0 {
			h.notifyAllGroupMembers(allTelephons, "group_member_added", map[string]interface{}{
				"groupID":         groupID.(uint),
				"addedByUsername": adderUsername,
				"addedMembers":    addedList,
				"newMemberCount":  len(allTelephons),
			})
		}

		ctx.JSON(http.StatusOK, gin.H{"message": "miembros añadidos correctamente"})
	}
}

func (h *HandlerGroup) HandleSendGroupMessage() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exists := ctx.Get("telephon")
		groupID, exists2 := ctx.Get("groupID")
		data, exists3 := ctx.Get("groupMessage")
		if !exists || !exists2 || !exists3 {
			respondErrorMsg(ctx, http.StatusBadRequest, "error al obtener los datos")
			return
		}

		msgData := data.(models.GroupMessageSend)
		msgData.GroupID = groupID.(uint)

		msg, err := h.service.SendGroupMessage(telephon.(string), msgData, ctx)
		if err != nil {
			respondError(ctx, http.StatusBadRequest, err)
			return
		}
		ctx.JSON(http.StatusCreated, gin.H{"message": msg})
	}
}

func (h *HandlerGroup) HandleGetGroupMessages() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exists := ctx.Get("telephon")
		groupID, exists2 := ctx.Get("groupID")
		if !exists || !exists2 {
			respondErrorMsg(ctx, http.StatusBadRequest, "error al obtener los datos")
			return
		}

		limit := 50
		offset := 0
		if l, err := strconv.Atoi(ctx.DefaultQuery("limit", "50")); err == nil && l > 0 {
			limit = l
		}
		if o, err := strconv.Atoi(ctx.DefaultQuery("offset", "0")); err == nil && o >= 0 {
			offset = o
		}

		messages, err := h.service.GetGroupMessages(telephon.(string), groupID.(uint), limit, offset, ctx)
		if err != nil {
			respondError(ctx, http.StatusForbidden, err)
			return
		}
		if h.notifier != nil {
			h.notifier.JoinRoomByTelephon(groupID.(uint), telephon.(string))
		}
		ctx.JSON(http.StatusOK, gin.H{"messages": messages})
	}
}

func (h *HandlerGroup) HandleEditGroupMessage() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exists := ctx.Get("telephon")
		groupID, exists2 := ctx.Get("groupID")
		data, exists3 := ctx.Get("groupMessageEdit")
		if !exists || !exists2 || !exists3 {
			respondErrorMsg(ctx, http.StatusBadRequest, "error al obtener los datos")
			return
		}

		msg, err := h.service.EditGroupMessage(telephon.(string), groupID.(uint), data.(models.GroupMessageEdit), ctx)
		if err != nil {
			respondError(ctx, http.StatusBadRequest, err)
			return
		}
		ctx.JSON(http.StatusOK, gin.H{"message": msg})
	}
}

func (h *HandlerGroup) HandleDeleteGroupMessage() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exists := ctx.Get("telephon")
		groupID, exists2 := ctx.Get("groupID")
		data, exists3 := ctx.Get("groupMessageDelete")
		if !exists || !exists2 || !exists3 {
			respondErrorMsg(ctx, http.StatusBadRequest, "error al obtener los datos")
			return
		}

		err := h.service.DeleteGroupMessage(telephon.(string), groupID.(uint), data.(models.GroupMessageDelete), ctx)
		if err != nil {
			respondError(ctx, http.StatusBadRequest, err)
			return
		}
		ctx.JSON(http.StatusOK, gin.H{"message": "mensaje eliminado correctamente"})
	}
}

func (h *HandlerGroup) HandleRemoveMember() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exists := ctx.Get("telephon")
		groupID, exists2 := ctx.Get("groupID")
		data, exists3 := ctx.Get("groupRemoveMember")
		if !exists || !exists2 || !exists3 {
			respondErrorMsg(ctx, http.StatusBadRequest, "error al obtener los datos")
			return
		}

		removeData := data.(models.GroupRemoveMember)

		allTelephons, _ := h.service.GetMemberTelephons(groupID.(uint), ctx)

		if err := h.service.RemoveMember(telephon.(string), groupID.(uint), removeData, ctx); err != nil {
			status := http.StatusBadRequest
			if err.Error() == "solo los administradores pueden eliminar miembros" {
				status = http.StatusForbidden
			}
			// Mensaje del servicio verificado como literal seguro; el error
			// real se registra en logs.
			respondError(ctx, status, models.NewAppError(status, err.Error(), err))
			return
		}

		if len(allTelephons) > 0 {
			adminUsername, _ := h.service.GetUsernameByTelephon(telephon.(string), ctx)
			removedUsername, _ := h.service.GetUsernameByTelephon(removeData.Number, ctx)
			h.notifyAllGroupMembers(allTelephons, "group_member_removed", map[string]interface{}{
				"groupID":           groupID.(uint),
				"telephon":          removeData.Number,
				"username":          removedUsername,
				"removedBy":         telephon.(string),
				"removedByUsername": adminUsername,
			})
		}

		ctx.JSON(http.StatusOK, gin.H{"message": "miembro eliminado correctamente"})
	}
}

func (h *HandlerGroup) HandleUpdateGroupDescription() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exists := ctx.Get("telephon")
		groupID, exists2 := ctx.Get("groupID")
		if !exists || !exists2 {
			respondErrorMsg(ctx, http.StatusBadRequest, "error al obtener los datos")
			return
		}

		var body struct {
			Description string `json:"description" binding:"max=300"`
		}
		if err := ctx.ShouldBindJSON(&body); err != nil {
			respondErrorMsg(ctx, http.StatusBadRequest, "descripción inválida (máx. 300 caracteres)")
			return
		}

		if err := h.service.UpdateGroupDescription(telephon.(string), groupID.(uint), body.Description, ctx); err != nil {
			respondError(ctx, http.StatusBadRequest, err)
			return
		}

		telephons, err := h.service.GetMemberTelephons(groupID.(uint), ctx)
		if err == nil {
			changedByUsername, _ := h.service.GetUsernameByTelephon(telephon.(string), ctx)
			h.notifyAllGroupMembers(telephons, "group_description_update", map[string]interface{}{
				"groupID":           groupID.(uint),
				"description":       body.Description,
				"changedBy":         telephon.(string),
				"changedByUsername": changedByUsername,
			})
		}

		ctx.JSON(http.StatusOK, gin.H{"description": body.Description})
	}
}

func (h *HandlerGroup) HandleUpdateGroupAvatar() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exists := ctx.Get("telephon")
		groupID, exists2 := ctx.Get("groupID")
		if !exists || !exists2 {
			respondErrorMsg(ctx, http.StatusBadRequest, "error al obtener los datos")
			return
		}

		var body struct {
			AvatarUrl string `json:"avatarUrl" binding:"required"`
		}
		if err := ctx.ShouldBindJSON(&body); err != nil {
			respondErrorMsg(ctx, http.StatusBadRequest, "avatarUrl requerido")
			return
		}

		if err := h.service.UpdateGroupAvatar(telephon.(string), groupID.(uint), body.AvatarUrl, ctx); err != nil {
			respondError(ctx, http.StatusBadRequest, err)
			return
		}

		telephons, err := h.service.GetMemberTelephons(groupID.(uint), ctx)
		if err == nil {
			h.notifyAllGroupMembers(telephons, "group_avatar_update", map[string]interface{}{
				"groupID":   groupID.(uint),
				"avatarUrl": body.AvatarUrl,
			})
		}

		ctx.JSON(http.StatusOK, gin.H{"avatarUrl": body.AvatarUrl})
	}
}

func (h *HandlerGroup) HandleSetMemberRole() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exists := ctx.Get("telephon")
		groupID, exists2 := ctx.Get("groupID")
		data, exists3 := ctx.Get("groupSetRole")
		if !exists || !exists2 || !exists3 {
			respondErrorMsg(ctx, http.StatusBadRequest, "error al obtener los datos")
			return
		}

		roleData := data.(models.GroupSetRole)
		if err := h.service.SetMemberRole(telephon.(string), groupID.(uint), roleData, ctx); err != nil {
			status := http.StatusBadRequest
			if err.Error() == "solo los administradores pueden cambiar roles" {
				status = http.StatusForbidden
			}
			// Mensaje del servicio verificado como literal seguro; el error
			// real se registra en logs.
			respondError(ctx, status, models.NewAppError(status, err.Error(), err))
			return
		}

		telephons, err := h.service.GetMemberTelephons(groupID.(uint), ctx)
		if err == nil && len(telephons) > 0 {
			adminUsername, _ := h.service.GetUsernameByTelephon(telephon.(string), ctx)
			targetUsername, _ := h.service.GetUsernameByTelephon(roleData.Number, ctx)
			h.notifyAllGroupMembers(telephons, "group_role_changed", map[string]interface{}{
				"groupID":           groupID.(uint),
				"targetTelephon":    roleData.Number,
				"targetUsername":    targetUsername,
				"newRole":           roleData.Role,
				"changedBy":         telephon.(string),
				"changedByUsername": adminUsername,
			})
		}

		ctx.JSON(http.StatusOK, gin.H{
			"message": "rol actualizado correctamente",
			"number":  roleData.Number,
			"role":    roleData.Role,
		})
	}
}

func (h *HandlerGroup) HandleLeaveGroup() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exists := ctx.Get("telephon")
		groupID, exists2 := ctx.Get("groupID")
		if !exists || !exists2 {
			respondErrorMsg(ctx, http.StatusBadRequest, "error al obtener los datos")
			return
		}

		username, _ := h.service.GetUsernameByTelephon(telephon.(string), ctx)

		promotedTelephon, err := h.service.LeaveGroup(telephon.(string), groupID.(uint), ctx)
		if err != nil {
			respondError(ctx, http.StatusBadRequest, err)
			return
		}

		telephons, notifyErr := h.service.GetMemberTelephons(groupID.(uint), ctx)
		if notifyErr == nil && len(telephons) > 0 {
			if promotedTelephon != "" {
				promotedUsername, _ := h.service.GetUsernameByTelephon(promotedTelephon, ctx)
				h.notifyAllGroupMembers(telephons, "group_role_changed", map[string]interface{}{
					"groupID":           groupID.(uint),
					"targetTelephon":    promotedTelephon,
					"targetUsername":    promotedUsername,
					"newRole":           "admin",
					"changedBy":         telephon.(string),
					"changedByUsername": username,
					"autoTransfer":      true,
				})
			}
			h.notifyAllGroupMembers(telephons, "group_member_left", map[string]interface{}{
				"groupID":  groupID.(uint),
				"telephon": telephon.(string),
				"username": username,
			})
		}

		ctx.JSON(http.StatusOK, gin.H{"message": "has salido del grupo"})
	}
}
