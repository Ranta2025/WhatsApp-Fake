package handlers

import (
	"encoding/json"
	"errors"
	"gorm/backend/metrics"
	"gorm/backend/models"
	"gorm/backend/schemas"
	"gorm/backend/services"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// GroupHubNotifier es la interfaz mínima del Hub de WebSocket que necesita HandlerGroup
// para enviar notificaciones en tiempo real a clientes conectados tras operaciones REST.
type GroupHubNotifier interface {
	SendTo(telephon string, msg []byte)
	JoinRoomByTelephon(groupID uint, telephon string)
	LeaveRoomByTelephon(groupID uint, telephon string)
	SendToGroup(groupID uint, senderTelephon string, msg []byte)
}

// HandlerGroup gestiona los endpoints REST del dominio de grupos.
type HandlerGroup struct {
	service  services.GroupServicer
	notifier GroupHubNotifier // puede ser nil si el Hub no está disponible
	metrics  *metrics.Metrics // puede ser nil: no se contabiliza nada
}

// InitHandlerGroup crea el handler de grupos con su servicio, el notificador del
// Hub y las métricas (m puede ser nil).
func InitHandlerGroup(service services.GroupServicer, notifier GroupHubNotifier, m *metrics.Metrics) *HandlerGroup {
	return &HandlerGroup{service: service, notifier: notifier, metrics: m}
}

// notifyGroupMembers envía el mensaje WS a cada teléfono de la lista,
// los une a la room del grupo y excluye al solicitante (que ya tiene la respuesta HTTP).
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
			// Unir al cliente a la room para que reciba mensajes en tiempo real
			h.notifier.JoinRoomByTelephon(groupID, tel)
		}
	}
}

// notifyAllGroupMembers envía un evento WS a TODOS los miembros del grupo (sin exclusiones).
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

// respondGroupMutationError traduce los errores tipados de una mutación de
// membresía/permisos a su código HTTP: 403 permiso, 404 objetivo inexistente,
// 400 cambio inválido. Incluye las restricciones de la matriz de GA4 (enviar,
// editar info, agregar).
func (h *HandlerGroup) respondGroupMutationError(ctx *gin.Context, err error) {
	switch {
	case errors.Is(err, services.ErrNotGroupAdmin),
		errors.Is(err, services.ErrNotGroupMember),
		errors.Is(err, services.ErrGroupSendRestricted),
		errors.Is(err, services.ErrGroupEditRestricted),
		errors.Is(err, services.ErrGroupAddRestricted):
		ctx.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
	case errors.Is(err, services.ErrGroupTargetNotMember):
		ctx.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
	case errors.Is(err, services.ErrInvalidRoleChange):
		ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	default:
		ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/group
// ─────────────────────────────────────────────────────────────────────────────

// HandleCreateGroup crea un nuevo grupo con los miembros indicados.
// Los datos vienen validados por MiddlewareGroupCreate.
func (h *HandlerGroup) HandleCreateGroup() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exists := ctx.Get("telephon")
		data, exists2 := ctx.Get("groupCreate")
		if !exists || !exists2 {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "error al obtener los datos"})
			return
		}

		detail, err := h.service.CreateGroup(telephon.(string), data.(models.GroupCreate), ctx)
		if err != nil {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Notificar en tiempo real a cada miembro añadido (no al creador que ya tiene la respuesta)
		if detail != nil && len(detail.Members) > 0 {
			telephons := make([]string, 0, len(detail.Members))
			for _, m := range detail.Members {
				telephons = append(telephons, m.Telephon)
			}
			h.notifyGroupMembers(detail.ID, telephons, telephon.(string), detail.GroupResponse)
		}
		// El creador también debe unirse a la room para recibir mensajes en tiempo real
		if detail != nil && h.notifier != nil {
			h.notifier.JoinRoomByTelephon(detail.ID, telephon.(string))
		}

		ctx.JSON(http.StatusCreated, gin.H{"group": detail})
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/group
// ─────────────────────────────────────────────────────────────────────────────

// HandleGetUserGroups devuelve la lista de grupos en los que participa el usuario.
func (h *HandlerGroup) HandleGetUserGroups() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exists := ctx.Get("telephon")
		if !exists {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "error al obtener los datos"})
			return
		}

		groups, err := h.service.GetUserGroups(telephon.(string), ctx)
		if err != nil {
			ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		ctx.JSON(http.StatusOK, gin.H{"groups": groups})
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/group/:groupID
// ─────────────────────────────────────────────────────────────────────────────

// HandleGetGroupDetail devuelve el detalle de un grupo: info, miembros y últimos mensajes.
// Solo accesible para miembros del grupo.
func (h *HandlerGroup) HandleGetGroupDetail() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exists := ctx.Get("telephon")
		groupID, exists2 := ctx.Get("groupID")
		if !exists || !exists2 {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "error al obtener los datos"})
			return
		}

		detail, err := h.service.GetGroupDetail(telephon.(string), groupID.(uint), ctx)
		if err != nil {
			ctx.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
			return
		}
		// Auto-unir al usuario a la room del WS (mecanismo de auto-recuperación).
		// Garantiza que el usuario reciba mensajes en tiempo real incluso si su
		// membresía de room se perdió por una reconexión o carrera de goroutines.
		if h.notifier != nil {
			h.notifier.JoinRoomByTelephon(groupID.(uint), telephon.(string))
		}
		ctx.JSON(http.StatusOK, detail)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/group/:groupID/members
// ─────────────────────────────────────────────────────────────────────────────

// HandleAddMembers añade nuevos miembros a un grupo.
// Cualquier miembro puede añadir, pero solo puede añadir a sus propios contactos.
func (h *HandlerGroup) HandleAddMembers() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exists := ctx.Get("telephon")
		groupID, exists2 := ctx.Get("groupID")
		data, exists3 := ctx.Get("groupAddMembers")
		if !exists || !exists2 || !exists3 {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "error al obtener los datos"})
			return
		}

		added, systemMsg, err := h.service.AddMembers(telephon.(string), groupID.(uint), data.(models.GroupAddMembers), ctx)
		if err != nil {
			h.respondGroupMutationError(ctx, err)
			return
		}

		if len(added) > 0 {
			detail, detailErr := h.service.GetGroupDetail(telephon.(string), groupID.(uint), ctx)
			if detailErr == nil {
				// La lista realmente añadida la decide el servicio (no se infiere
				// de la petición ∩ miembros actuales).
				addedTelephons := make([]string, 0, len(added))
				for _, m := range added {
					addedTelephons = append(addedTelephons, m.Telephon)
				}
				allTelephons := make([]string, 0, len(detail.Members))
				adderUsername := ""
				for _, m := range detail.Members {
					allTelephons = append(allTelephons, m.Telephon)
					if m.Telephon == telephon.(string) {
						adderUsername = m.Username
					}
				}

				// 1. Notificar a los nuevos miembros con el detalle del grupo (sidebar)
				h.notifyGroupMembers(groupID.(uint), addedTelephons, telephon.(string), detail.GroupResponse)

				// 2. Broadcast "group_member_added" a TODOS los miembros actuales
				//    (el systemMessage persistido viaja en el propio evento).
				h.notifyAllGroupMembers(allTelephons, "group_member_added", map[string]interface{}{
					"groupID":         groupID.(uint),
					"addedByUsername": adderUsername,
					"addedMembers":    added,
					"newMemberCount":  len(allTelephons),
					"systemMessage":   systemMsg,
				})
			}
		}

		ctx.JSON(http.StatusOK, gin.H{"message": "miembros añadidos correctamente"})
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/group/:groupID/message
// ─────────────────────────────────────────────────────────────────────────────

// HandleSendGroupMessage envía un nuevo mensaje al grupo y lo persiste.
func (h *HandlerGroup) HandleSendGroupMessage() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exists := ctx.Get("telephon")
		groupID, exists2 := ctx.Get("groupID")
		data, exists3 := ctx.Get("groupMessage")
		if !exists || !exists2 || !exists3 {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "error al obtener los datos"})
			return
		}

		msgData := data.(models.GroupMessageSend)
		// Asegurarse de que el groupID de la URL y el del body coincidan
		msgData.GroupID = groupID.(uint)

		msg, err := h.service.SendGroupMessage(telephon.(string), msgData, ctx)
		if err != nil {
			if h.metrics != nil {
				h.metrics.MessageFailed(metrics.KindGroup)
			}
			h.respondGroupMutationError(ctx, err)
			return
		}
		if h.metrics != nil {
			h.metrics.MessageSent(metrics.KindGroup)
		}
		// Difundir en tiempo real al resto de miembros conectados (igual que por WS)
		if h.notifier != nil {
			if payload, err := json.Marshal(map[string]interface{}{"type": "group_chat", "payload": msg}); err == nil {
				h.notifier.SendToGroup(msgData.GroupID, telephon.(string), payload)
			}
		}
		ctx.JSON(http.StatusCreated, gin.H{"message": msg})
	}
}

// joinGroupRoom une al usuario a la room WS del grupo si hay notificador.
func (h *HandlerGroup) joinGroupRoom(groupID uint, telephon string) {
	if h.notifier != nil {
		h.notifier.JoinRoomByTelephon(groupID, telephon)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/group/:groupID/message
// ─────────────────────────────────────────────────────────────────────────────

// HandleGetGroupMessages devuelve el historial de mensajes del grupo con paginación.
// Query params: limit (default 50), offset (default 0) y before (id de mensaje;
// devuelve solo los anteriores). La respuesta incluye hasMore.
func (h *HandlerGroup) HandleGetGroupMessages() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exists := ctx.Get("telephon")
		groupID, exists2 := ctx.Get("groupID")
		if !exists || !exists2 {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "error al obtener los datos"})
			return
		}

		// Ventanas para "ir al mensaje" (búsqueda): cronológicas (más antiguo primero).
		if around, ok := parsePositiveID(ctx.Query("around")); ok {
			_, limit := parseSearchPaging(ctx)
			messages, hasOlder, hasNewer, err := h.service.GetGroupMessagesAround(telephon.(string), groupID.(uint), around, limit, ctx)
			if err != nil {
				respondWindowError(ctx, err)
				return
			}
			h.joinGroupRoom(groupID.(uint), telephon.(string))
			ctx.JSON(http.StatusOK, gin.H{"messages": messages, "hasMore": hasOlder, "hasMoreOlder": hasOlder, "hasMoreNewer": hasNewer})
			return
		}
		if after, ok := parsePositiveID(ctx.Query("after")); ok {
			_, limit := parseSearchPaging(ctx)
			messages, hasNewer, err := h.service.GetGroupMessagesAfter(telephon.(string), groupID.(uint), after, limit, ctx)
			if err != nil {
				respondWindowError(ctx, err)
				return
			}
			h.joinGroupRoom(groupID.(uint), telephon.(string))
			ctx.JSON(http.StatusOK, gin.H{"messages": messages, "hasMoreNewer": hasNewer})
			return
		}

		limit := 50
		offset := 0
		if l, err := strconv.Atoi(ctx.DefaultQuery("limit", "50")); err == nil && l > 0 {
			limit = l // el servicio aplica el máximo permitido
		}
		if o, err := strconv.Atoi(ctx.DefaultQuery("offset", "0")); err == nil && o >= 0 {
			offset = o
		}

		var before uint
		if b, err := strconv.ParseUint(ctx.Query("before"), 10, 32); err == nil {
			before = uint(b)
		}

		messages, hasMore, err := h.service.GetGroupMessagesPage(telephon.(string), groupID.(uint), before, limit, offset, ctx)
		if err != nil {
			ctx.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
			return
		}
		// Auto-unir al usuario a la room del WS al cargar mensajes (auto-recuperación).
		h.joinGroupRoom(groupID.(uint), telephon.(string))
		ctx.JSON(http.StatusOK, gin.H{"messages": messages, "hasMore": hasMore})
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/group/:groupID/message/search
// ─────────────────────────────────────────────────────────────────────────────

// HandleSearchGroupMessages busca mensajes de texto en el grupo. Solo miembros
// (403 en otro caso). Query params: q (2–100 caracteres), before y limit.
func (h *HandlerGroup) HandleSearchGroupMessages() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exists := ctx.Get("telephon")
		groupID, exists2 := ctx.Get("groupID")
		if !exists || !exists2 {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "error al obtener los datos"})
			return
		}
		before, limit := parseSearchPaging(ctx)
		page, err := h.service.SearchGroupMessages(telephon.(string), groupID.(uint), ctx.Query("q"), before, limit, ctx)
		if err != nil {
			respondSearchError(ctx, err)
			return
		}
		ctx.JSON(http.StatusOK, page)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/group/:groupID/message/:messageID/receipts
// ─────────────────────────────────────────────────────────────────────────────

// HandleGetMessageReceipts devuelve quién leyó / recibió / no ha recibido un
// mensaje de grupo. Solo el autor del mensaje puede consultarlo (403 si no).
func (h *HandlerGroup) HandleGetMessageReceipts() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exists := ctx.Get("telephon")
		groupID, exists2 := ctx.Get("groupID")
		messageID, exists3 := ctx.Get("messageID")
		if !exists || !exists2 || !exists3 {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "error al obtener los datos"})
			return
		}

		receipts, err := h.service.GetGroupMessageReceipts(telephon.(string), groupID.(uint), messageID.(uint), ctx)
		switch {
		case err == nil:
			ctx.JSON(http.StatusOK, receipts)
		case errors.Is(err, services.ErrNotMessageSender), errors.Is(err, services.ErrNotGroupMember):
			ctx.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		case errors.Is(err, services.ErrGroupMessageNotFound):
			ctx.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		default:
			ctx.JSON(http.StatusInternalServerError, gin.H{"error": "error al obtener los acuses"})
		}
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/v1/group/:groupID/message
// ─────────────────────────────────────────────────────────────────────────────

// HandleEditGroupMessage edita el contenido de un mensaje de grupo.
// Solo el remitente original puede editar sus propios mensajes.
func (h *HandlerGroup) HandleEditGroupMessage() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exists := ctx.Get("telephon")
		groupID, exists2 := ctx.Get("groupID")
		data, exists3 := ctx.Get("groupMessageEdit")
		if !exists || !exists2 || !exists3 {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "error al obtener los datos"})
			return
		}

		msg, err := h.service.EditGroupMessage(telephon.(string), groupID.(uint), data.(models.GroupMessageEdit), ctx)
		if err != nil {
			h.respondGroupMutationError(ctx, err)
			return
		}
		ctx.JSON(http.StatusOK, gin.H{"message": msg})
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/v1/group/:groupID/message
// ─────────────────────────────────────────────────────────────────────────────

// HandleDeleteGroupMessage elimina un mensaje de grupo.
// Solo el remitente original puede eliminar sus propios mensajes.
func (h *HandlerGroup) HandleDeleteGroupMessage() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exists := ctx.Get("telephon")
		groupID, exists2 := ctx.Get("groupID")
		data, exists3 := ctx.Get("groupMessageDelete")
		if !exists || !exists2 || !exists3 {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "error al obtener los datos"})
			return
		}

		err := h.service.DeleteGroupMessage(telephon.(string), groupID.(uint), data.(models.GroupMessageDelete), ctx)
		if err != nil {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		ctx.JSON(http.StatusOK, gin.H{"message": "mensaje eliminado correctamente"})
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/v1/group/:groupID/member
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/v1/group/:groupID/avatar
// ─────────────────────────────────────────────────────────────────────────────

// HandleUpdateGroupAvatar actualiza el avatar del grupo y notifica a todos los miembros en tiempo real.
func (h *HandlerGroup) HandleUpdateGroupAvatar() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exists := ctx.Get("telephon")
		groupID, exists2 := ctx.Get("groupID")
		if !exists || !exists2 {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "error al obtener los datos"})
			return
		}

		var body struct {
			AvatarUrl string `json:"avatarUrl" binding:"required"`
		}
		if err := ctx.ShouldBindJSON(&body); err != nil {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "avatarUrl requerido"})
			return
		}

		if err := h.service.UpdateGroupAvatar(telephon.(string), groupID.(uint), body.AvatarUrl, ctx); err != nil {
			h.respondGroupMutationError(ctx, err)
			return
		}

		// Notificar a todos los miembros del grupo en tiempo real
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

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/v1/group/:groupID/members/:telephon/role
// ─────────────────────────────────────────────────────────────────────────────

// HandleChangeMemberRole designa (role=admin) o descarta (role=member) a un
// miembro. Solo admins. Difunde `group_member_role` a todos los miembros con el
// mensaje de sistema persistido.
func (h *HandlerGroup) HandleChangeMemberRole() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exists := ctx.Get("telephon")
		groupID, exists2 := ctx.Get("groupID")
		target, exists3 := ctx.Get("groupTelephon")
		data, exists4 := ctx.Get("groupMemberRole")
		if !exists || !exists2 || !exists3 || !exists4 {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "error al obtener los datos"})
			return
		}

		actor := telephon.(string)
		targetTel := target.(string)
		role := data.(models.GroupMemberRoleUpdate).Role

		var (
			systemMsg *schemas.GroupMessageResponse
			err       error
		)
		if role == models.GroupRoleAdmin {
			systemMsg, err = h.service.Promote(actor, groupID.(uint), targetTel, ctx)
		} else {
			systemMsg, err = h.service.Dismiss(actor, groupID.(uint), targetTel, ctx)
		}
		if err != nil {
			h.respondGroupMutationError(ctx, err)
			return
		}

		telephons, notifyErr := h.service.GetMemberTelephons(groupID.(uint), ctx)
		if notifyErr == nil {
			h.notifyAllGroupMembers(telephons, "group_member_role", map[string]interface{}{
				"groupID":       groupID.(uint),
				"telephon":      targetTel,
				"role":          role,
				"systemMessage": systemMsg,
			})
		}

		ctx.JSON(http.StatusOK, gin.H{
			"groupID":       groupID.(uint),
			"telephon":      targetTel,
			"role":          role,
			"systemMessage": systemMsg,
		})
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/v1/group/:groupID/members/:telephon
// ─────────────────────────────────────────────────────────────────────────────

// HandleRemoveMember elimina a un miembro del grupo. Solo admins. El removido
// sale de la room (no recibe más broadcasts), recibe el evento
// `group_member_removed` (para pasar a estado left) y se avisa al resto.
func (h *HandlerGroup) HandleRemoveMember() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exists := ctx.Get("telephon")
		groupID, exists2 := ctx.Get("groupID")
		target, exists3 := ctx.Get("groupTelephon")
		if !exists || !exists2 || !exists3 {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "error al obtener los datos"})
			return
		}

		actor := telephon.(string)
		targetTel := target.(string)

		username, _ := h.service.GetUsernameByTelephon(targetTel, ctx)

		systemMsg, err := h.service.Remove(actor, groupID.(uint), targetTel, ctx)
		if err != nil {
			h.respondGroupMutationError(ctx, err)
			return
		}

		// El removido deja de recibir los broadcasts de la room.
		if h.notifier != nil {
			h.notifier.LeaveRoomByTelephon(groupID.(uint), targetTel)
		}

		remaining, notifyErr := h.service.GetMemberTelephons(groupID.(uint), ctx)
		if notifyErr == nil {
			// El removido también recibe el evento (su UI pasa a estado left).
			recipients := append(append([]string{}, remaining...), targetTel)
			h.notifyAllGroupMembers(recipients, "group_member_removed", map[string]interface{}{
				"groupID":        groupID.(uint),
				"telephon":       targetTel,
				"username":       username,
				"newMemberCount": len(remaining),
				"systemMessage":  systemMsg,
			})
		}

		ctx.JSON(http.StatusOK, gin.H{
			"groupID":       groupID.(uint),
			"telephon":      targetTel,
			"systemMessage": systemMsg,
		})
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/v1/group/:groupID/settings
// ─────────────────────────────────────────────────────────────────────────────

// HandleUpdateGroupSettings cambia la configuración de permisos del grupo (solo
// admins). Difunde `group_settings` con los valores resultantes y el mensaje de
// sistema persistido.
func (h *HandlerGroup) HandleUpdateGroupSettings() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exists := ctx.Get("telephon")
		groupID, exists2 := ctx.Get("groupID")
		data, exists3 := ctx.Get("groupSettings")
		if !exists || !exists2 || !exists3 {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "error al obtener los datos"})
			return
		}

		result, err := h.service.UpdateSettings(telephon.(string), groupID.(uint), data.(models.GroupSettingsUpdate), ctx)
		if err != nil {
			h.respondGroupMutationError(ctx, err)
			return
		}

		telephons, notifyErr := h.service.GetMemberTelephons(groupID.(uint), ctx)
		if notifyErr == nil {
			h.notifyAllGroupMembers(telephons, "group_settings", result)
		}

		ctx.JSON(http.StatusOK, result)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/v1/group/:groupID
// ─────────────────────────────────────────────────────────────────────────────

// HandleUpdateGroupInfo cambia el nombre/descripción del grupo. Difunde
// `group_info` con los valores resultantes y el mensaje de sistema persistido.
func (h *HandlerGroup) HandleUpdateGroupInfo() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exists := ctx.Get("telephon")
		groupID, exists2 := ctx.Get("groupID")
		data, exists3 := ctx.Get("groupInfo")
		if !exists || !exists2 || !exists3 {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "error al obtener los datos"})
			return
		}

		result, err := h.service.UpdateInfo(telephon.(string), groupID.(uint), data.(models.GroupInfoUpdate), ctx)
		if err != nil {
			h.respondGroupMutationError(ctx, err)
			return
		}

		telephons, notifyErr := h.service.GetMemberTelephons(groupID.(uint), ctx)
		if notifyErr == nil {
			h.notifyAllGroupMembers(telephons, "group_info", result)
		}

		ctx.JSON(http.StatusOK, result)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/v1/group/:groupID/member
// ─────────────────────────────────────────────────────────────────────────────

// HandleLeaveGroup elimina la membresía del usuario autenticado en el grupo.
func (h *HandlerGroup) HandleLeaveGroup() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exists := ctx.Get("telephon")
		groupID, exists2 := ctx.Get("groupID")
		if !exists || !exists2 {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "error al obtener los datos"})
			return
		}

		// Obtener el username antes de salir para incluirlo en la notificación
		username, _ := h.service.GetUsernameByTelephon(telephon.(string), ctx)

		systemMsg, err := h.service.LeaveGroup(telephon.(string), groupID.(uint), ctx)
		if err != nil {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Dejar de recibir los mensajes del grupo en tiempo real
		if h.notifier != nil {
			h.notifier.LeaveRoomByTelephon(groupID.(uint), telephon.(string))
		}

		// Notificar a los miembros restantes (el usuario ya no está en la lista)
		telephons, notifyErr := h.service.GetMemberTelephons(groupID.(uint), ctx)
		if notifyErr == nil && len(telephons) > 0 {
			h.notifyAllGroupMembers(telephons, "group_member_left", map[string]interface{}{
				"groupID":       groupID.(uint),
				"telephon":      telephon.(string),
				"username":      username,
				"systemMessage": systemMsg,
			})
		}

		ctx.JSON(http.StatusOK, gin.H{"message": "has salido del grupo"})
	}
}
