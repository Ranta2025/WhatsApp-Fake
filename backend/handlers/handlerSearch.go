package handlers

import (
	"errors"
	"gorm/backend/models"
	"gorm/backend/services"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// HandlerSearch expone la búsqueda global de mensajes.
type HandlerSearch struct {
	service services.SearchServicer
}

// InitHandlerSearch crea el handler de búsqueda global.
func InitHandlerSearch(service services.SearchServicer) *HandlerSearch {
	return &HandlerSearch{service: service}
}

// parseSearchPaging lee before y limit; los valores ausentes o inválidos dan 0
// (el servicio aplica sus valores por defecto).
func parseSearchPaging(ctx *gin.Context) (before uint, limit int) {
	if b, err := strconv.ParseUint(ctx.Query("before"), 10, 32); err == nil {
		before = uint(b)
	}
	if l, err := strconv.Atoi(ctx.Query("limit")); err == nil && l > 0 {
		limit = l
	}
	return before, limit
}

// parsePositiveID lee un id > 0 (ausente o inválido devuelve false).
func parsePositiveID(raw string) (uint, bool) {
	v, err := strconv.ParseUint(raw, 10, 32)
	if err != nil || v == 0 {
		return 0, false
	}
	return uint(v), true
}

// respondWindowError traduce los errores de las ventanas around/after:
// mensaje no visible/inexistente 404, no miembro 403, resto 500.
func respondWindowError(ctx *gin.Context, err error) {
	switch {
	case errors.Is(err, models.ErrMessageNotFound), errors.Is(err, models.ErrGroupMessageNotFound):
		ctx.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
	case errors.Is(err, services.ErrNotGroupMember):
		ctx.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
	default:
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
	}
}

// respondSearchError traduce los errores de búsqueda a códigos HTTP.
func respondSearchError(ctx *gin.Context, err error) {
	switch {
	case errors.Is(err, services.ErrInvalidSearchQuery):
		ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	case errors.Is(err, services.ErrNotGroupMember):
		ctx.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
	default:
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
	}
}

// HandlerSearchAll busca mensajes en todos los chats y grupos del usuario.
// Query params: q (2–100 caracteres), limit (máx. de chats) y perChat.
func (h *HandlerSearch) HandlerSearchAll() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, ok := ctx.Get("telephon")
		if !ok {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "error al obtener los datos"})
			return
		}
		_, maxChats := parseSearchPaging(ctx)
		perChat := 0
		if p, err := strconv.Atoi(ctx.Query("perChat")); err == nil && p > 0 {
			perChat = p
		}
		out, err := h.service.SearchAll(telephon.(string), ctx.Query("q"), perChat, maxChats, ctx)
		if err != nil {
			respondSearchError(ctx, err)
			return
		}
		ctx.JSON(http.StatusOK, out)
	}
}
