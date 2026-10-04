package handlers

import (
	"context"
	"errors"
	"gorm/backend/logging"
	"gorm/backend/models"
	"gorm/backend/services"
	"net/http"

	"github.com/gin-gonic/gin"
)

// HandlerMute gestiona el silencio por chat (1:1 y grupos) del usuario autenticado.
type HandlerMute struct {
	service services.MuteServicer
}

// InitHandlerMute crea el handler de silencios con su servicio.
func InitHandlerMute(service services.MuteServicer) *HandlerMute {
	return &HandlerMute{service: service}
}

// respondMuteError traduce un error del servicio de silencios a HTTP: 400
// duración inválida, 404 chat inexistente, 403 no miembro del grupo y 500
// genérico para el resto.
func respondMuteError(ctx *gin.Context, err error) {
	switch {
	case errors.Is(err, services.ErrMuteInvalidDuration):
		ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	case errors.Is(err, services.ErrMuteChatNotFound):
		ctx.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
	case errors.Is(err, services.ErrNotGroupMember):
		ctx.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
	default:
		respondInternal(ctx, err)
	}
}

// muteRequest lee el usuario autenticado y el chat destino que dejaron los
// middlewares: :contact (MiddlewateGetChat) para "direct" y :groupID
// (MiddlewareGroupID) para "group".
func muteRequest(ctx *gin.Context, kind string) (string, services.MuteTarget, bool) {
	telephon := ctx.GetString("telephon")
	target := services.MuteTarget{Kind: kind}
	switch kind {
	case models.ChatKindDirect:
		target.Telephon = ctx.GetString("contact")
		return telephon, target, telephon != "" && target.Telephon != ""
	case models.ChatKindGroup:
		target.GroupID = ctx.GetUint("groupID")
		return telephon, target, telephon != "" && target.GroupID != 0
	}
	return telephon, target, false
}

// HandlerSetMute silencia el chat con la duración validada por
// MiddlewareMuteDuration: 200 {"muted":true,"mutedUntil":RFC3339|null}
// (null = para siempre).
func (hd *HandlerMute) HandlerSetMute(kind string) gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, target, ok := muteRequest(ctx, kind)
		duration, hasDuration := ctx.Get("muteDuration")
		if !ok || !hasDuration {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "error al obtener los datos"})
			return
		}
		res, err := hd.service.SetMute(telephon, target, duration.(string), ctx)
		if err != nil {
			respondMuteError(ctx, err)
			return
		}
		ctx.JSON(http.StatusOK, res)
	}
}

// HandlerClearMute quita el silencio del chat (204, también si no estaba silenciado).
func (hd *HandlerMute) HandlerClearMute(kind string) gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, target, ok := muteRequest(ctx, kind)
		if !ok {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "error al obtener los datos"})
			return
		}
		if err := hd.service.ClearMute(telephon, target, ctx); err != nil {
			respondMuteError(ctx, err)
			return
		}
		noContent(ctx)
	}
}

// logMuteDecorateError deja constancia de que un listado salió sin el estado
// de silencio: el listado es más importante que el icono, así que no falla.
func logMuteDecorateError(ctx *gin.Context, list string, err error) {
	var base context.Context = ctx
	if ctx.Request != nil {
		base = ctx.Request.Context()
	}
	logging.FromContext(base).Warn("silencios: listado sin estado de silencio", "list", list, "err", err)
}
