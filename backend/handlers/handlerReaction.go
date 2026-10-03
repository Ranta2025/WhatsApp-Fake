package handlers

import (
	"gorm/backend/models"
	"gorm/backend/schemas"
	"gorm/backend/services"
	"gorm/backend/websocket"
	"net/http"

	"github.com/gin-gonic/gin"
)

// HandlerReaction expone el espejo REST de las reacciones (el transporte
// principal es el evento WS `react`). PUT/DELETE difunden el mismo evento
// `reaction` por el hub para que los cambios hechos por REST también sean en vivo.
type HandlerReaction struct {
	service services.ReactionServicer
	hub     *websocket.Hub
}

// InitHandlerReaction crea el handler de reacciones.
func InitHandlerReaction(service services.ReactionServicer, hub *websocket.Hub) *HandlerReaction {
	return &HandlerReaction{service: service, hub: hub}
}

// reactionRequest extrae del contexto (middlewares) quién llama y el objetivo.
// En 1:1 groupID es 0.
func reactionRequest(ctx *gin.Context, kind string) (telephon string, messageID, groupID uint, ok bool) {
	tel, exists := ctx.Get("telephon")
	msg, exists2 := ctx.Get("messageID")
	if !exists || !exists2 {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "error al obtener los datos"})
		return "", 0, 0, false
	}
	telephon, _ = tel.(string)
	messageID, _ = msg.(uint)
	if kind == models.ReactionKindGroup {
		g, exists3 := ctx.Get("groupID")
		if !exists3 {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "error al obtener los datos"})
			return "", 0, 0, false
		}
		groupID, _ = g.(uint)
	}
	return telephon, messageID, groupID, telephon != "" && messageID != 0
}

func (h *HandlerReaction) respondError(ctx *gin.Context, err error) {
	status := services.ReactionErrorStatus(err)
	if status == http.StatusInternalServerError {
		ctx.JSON(status, gin.H{"error": "error al procesar la reacción"})
		return
	}
	ctx.JSON(status, gin.H{"error": err.Error()})
}

// react aplica la reacción (emoji vacío = quitar), difunde el evento y responde.
func (h *HandlerReaction) react(ctx *gin.Context, kind, emoji string) {
	telephon, messageID, groupID, ok := reactionRequest(ctx, kind)
	if !ok {
		return
	}
	change, err := h.service.React(telephon, kind, messageID, groupID, emoji, ctx)
	if err != nil {
		h.respondError(ctx, err)
		return
	}
	h.hub.PublishReaction(change, nil)
	ctx.JSON(http.StatusOK, gin.H{
		"kind": kind, "messageID": messageID, "emoji": change.Emoji, "changed": change.Changed,
	})
}

// HandlerSetReaction: PUT .../reaction con {emoji}. Crea o reemplaza la reacción
// del usuario; el emoji no puede ser vacío (para quitarla existe DELETE).
func (h *HandlerReaction) HandlerSetReaction(kind string) gin.HandlerFunc {
	return func(ctx *gin.Context) {
		var body schemas.ReactionBody
		if err := ctx.ShouldBindJSON(&body); err != nil || body.Emoji == "" {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "el campo emoji es obligatorio"})
			return
		}
		h.react(ctx, kind, body.Emoji)
	}
}

// HandlerRemoveReaction: DELETE .../reaction. Idempotente: sin reacción previa
// responde 200 con changed=false y no difunde nada.
func (h *HandlerReaction) HandlerRemoveReaction(kind string) gin.HandlerFunc {
	return func(ctx *gin.Context) {
		h.react(ctx, kind, "")
	}
}

// HandlerListReactions: GET .../reactions -> {reactions:[{emoji, users:[...]}]}.
func (h *HandlerReaction) HandlerListReactions(kind string) gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, messageID, groupID, ok := reactionRequest(ctx, kind)
		if !ok {
			return
		}
		list, err := h.service.ListReactionsFor(telephon, kind, messageID, groupID, ctx)
		if err != nil {
			h.respondError(ctx, err)
			return
		}
		out := schemas.ReactionsResponse{Reactions: make([]schemas.ReactionUsersResponse, 0, len(list))}
		for _, r := range list {
			users := make([]schemas.ReactionUserResponse, 0, len(r.Users))
			for _, u := range r.Users {
				users = append(users, schemas.ReactionUserResponse{Telephon: u.Telephon, Username: u.Username, AvatarUrl: u.AvatarUrl})
			}
			out.Reactions = append(out.Reactions, schemas.ReactionUsersResponse{Emoji: r.Emoji, Users: users})
		}
		ctx.JSON(http.StatusOK, out)
	}
}
