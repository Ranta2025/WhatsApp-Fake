package handlers

import (
	"encoding/json"
	"gorm/backend/models"
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
}

// HandlerGroup gestiona los endpoints REST del dominio de grupos.
type HandlerGroup struct {
	service  services.GroupServicer
	notifier GroupHubNotifier // puede ser nil si el Hub no está disponible
}

// InitHandlerGroup crea el handler de grupos con su servicio y el notificador del Hub.
func InitHandlerGroup(service services.GroupServicer, notifier GroupHubNotifier) *HandlerGroup {
	return &HandlerGroup{service: service, notifier: notifier}
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

		members := data.(models.GroupAddMembers).Members

		err := h.service.AddMembers(telephon.(string), groupID.(uint), data.(models.GroupAddMembers), ctx)
		if err != nil {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// 1. Notificar a los nuevos miembros con el detalle completo del grupo (sidebar)
		if len(members) > 0 {
			if detail, detailErr := h.service.GetGroupDetail(telephon.(string), groupID.(uint), ctx); detailErr == nil {
				h.notifyGroupMembers(groupID.(uint), members, telephon.(string), detail.GroupResponse)
			}
		}

		// 2. Broadcast "group_member_added" a TODOS los miembros actuales
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
			ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		ctx.JSON(http.StatusCreated, gin.H{"message": msg})
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/group/:groupID/message
// ─────────────────────────────────────────────────────────────────────────────

// HandleGetGroupMessages devuelve el historial de mensajes del grupo con paginación.
// Query params: limit (default 50), offset (default 0).
func (h *HandlerGroup) HandleGetGroupMessages() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exists := ctx.Get("telephon")
		groupID, exists2 := ctx.Get("groupID")
		if !exists || !exists2 {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "error al obtener los datos"})
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
			ctx.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
			return
		}
		// Auto-unir al usuario a la room del WS al cargar mensajes (auto-recuperación).
		if h.notifier != nil {
			h.notifier.JoinRoomByTelephon(groupID.(uint), telephon.(string))
		}
		ctx.JSON(http.StatusOK, gin.H{"messages": messages})
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
			ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
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
// PATCH /api/v1/group/:groupID/description
// ─────────────────────────────────────────────────────────────────────────────

// HandleUpdateGroupDescription actualiza la descripción del grupo.
// Solo los administradores pueden invocar este endpoint.
func (h *HandlerGroup) HandleUpdateGroupDescription() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exists := ctx.Get("telephon")
		groupID, exists2 := ctx.Get("groupID")
		if !exists || !exists2 {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "error al obtener los datos"})
			return
		}

		var body struct {
			Description string `json:"description" binding:"max=300"`
		}
		if err := ctx.ShouldBindJSON(&body); err != nil {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "descripción inválida (máx. 300 caracteres)"})
			return
		}

		if err := h.service.UpdateGroupDescription(telephon.(string), groupID.(uint), body.Description, ctx); err != nil {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Notificar a todos los miembros en tiempo real
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
			ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
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
// DELETE /api/v1/group/:groupID/member
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/v1/group/:groupID/member/role
// ─────────────────────────────────────────────────────────────────────────────

// HandleSetMemberRole promueve o degrada el rol de un miembro del grupo.
// Solo los administradores pueden invocar este endpoint.
// Emite el evento WS "group_role_changed" a todos los miembros del grupo.
func (h *HandlerGroup) HandleSetMemberRole() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exists := ctx.Get("telephon")
		groupID, exists2 := ctx.Get("groupID")
		data, exists3 := ctx.Get("groupSetRole")
		if !exists || !exists2 || !exists3 {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "error al obtener los datos"})
			return
		}

		roleData := data.(models.GroupSetRole)
		if err := h.service.SetMemberRole(telephon.(string), groupID.(uint), roleData, ctx); err != nil {
			status := http.StatusBadRequest
			if err.Error() == "solo los administradores pueden cambiar roles" {
				status = http.StatusForbidden
			}
			ctx.JSON(status, gin.H{"error": err.Error()})
			return
		}

		// Notificar en tiempo real a todos los miembros del grupo
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

// HandleLeaveGroup elimina la membresía del usuario autenticado en el grupo.
// Si era el único admin y quedan otros miembros, el servicio auto-promueve al
// miembro más antiguo; en ese caso este handler notifica el cambio de rol antes
// de notificar la salida.
func (h *HandlerGroup) HandleLeaveGroup() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exists := ctx.Get("telephon")
		groupID, exists2 := ctx.Get("groupID")
		if !exists || !exists2 {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "error al obtener los datos"})
			return
		}

		// Obtener username antes de salir para incluirlo en las notificaciones
		username, _ := h.service.GetUsernameByTelephon(telephon.(string), ctx)

		promotedTelephon, err := h.service.LeaveGroup(telephon.(string), groupID.(uint), ctx)
		if err != nil {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Notificar a los miembros restantes (el usuario ya no está en la lista)
		telephons, notifyErr := h.service.GetMemberTelephons(groupID.(uint), ctx)
		if notifyErr == nil && len(telephons) > 0 {
			// Si hubo auto-promoción, notificar el cambio de rol primero
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
			// Notificar la salida del miembro
			h.notifyAllGroupMembers(telephons, "group_member_left", map[string]interface{}{
				"groupID":  groupID.(uint),
				"telephon": telephon.(string),
				"username": username,
			})
		}

		ctx.JSON(http.StatusOK, gin.H{"message": "has salido del grupo"})
	}
}
