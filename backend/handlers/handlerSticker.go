package handlers

import (
	"errors"
	"net/http"
	"strconv"

	"gorm/backend/models"
	"gorm/backend/services"

	"github.com/gin-gonic/gin"
)

// maxStickerUploadBody acota el cuerpo de la subida de un sticker (1 MB, por
// encima del tope de un WebP animado para dejar sitio al multipart).
const maxStickerUploadBody = 1 << 20

// HandlerSticker gestiona la biblioteca de stickers del usuario autenticado.
type HandlerSticker struct {
	service services.StickerLibraryServicer
}

// InitHandlerSticker crea el handler de stickers con su servicio.
func InitHandlerSticker(service services.StickerLibraryServicer) *HandlerSticker {
	return &HandlerSticker{service: service}
}

// respondStickerError traduce los errores del servicio a HTTP: 404 no
// encontrado/ajeno, 409 tope alcanzado, 400 validación y 500 (genérico) los
// fallos internos.
func respondStickerError(ctx *gin.Context, err error) {
	switch {
	case errors.Is(err, models.ErrStickerNotFound):
		ctx.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
	case errors.Is(err, services.ErrStickerLimit):
		ctx.JSON(http.StatusConflict, gin.H{"error": err.Error()})
	case errors.Is(err, services.ErrStickerSaveURLInvalid),
		errors.Is(err, services.ErrStickerBuiltinFavorite),
		errors.Is(err, services.ErrStickerFavoriteInvalid),
		errors.Is(err, services.ErrStickerInvalid):
		ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	default:
		respondInternal(ctx, err)
	}
}

// HandlerUploadSticker sube un sticker (multipart `file` + `tags` CSV opcional)
// y lo persiste en "Mis stickers": 201 si es nuevo, 200 si el usuario ya lo
// tenía (mismo contenido).
func (h *HandlerSticker) HandlerUploadSticker() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon := ctx.GetString("telephon")
		if telephon == "" {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "error al obtener los datos"})
			return
		}
		ctx.Request.Body = http.MaxBytesReader(ctx.Writer, ctx.Request.Body, maxStickerUploadBody)
		if err := ctx.Request.ParseMultipartForm(maxStickerUploadBody); err != nil {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "sticker demasiado grande o formulario inválido"})
			return
		}
		file, header, err := ctx.Request.FormFile("file")
		if err != nil {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "campo 'file' requerido"})
			return
		}
		defer file.Close()

		res, created, err := h.service.UploadSticker(telephon, ctx.PostForm("tags"), file, header, ctx.Request.Context())
		if err != nil {
			respondStickerError(ctx, err)
			return
		}
		status := http.StatusOK
		if created {
			status = http.StatusCreated
		}
		ctx.JSON(status, res)
	}
}

// HandlerSaveSticker añade a "Mis stickers" una URL de sticker ya almacenada
// (recibido), referenciando el mismo objeto. 200 con el sticker.
func (h *HandlerSticker) HandlerSaveSticker() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon := ctx.GetString("telephon")
		if telephon == "" {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "error al obtener los datos"})
			return
		}
		var input models.StickerSaveInput
		if err := ctx.ShouldBindJSON(&input); err != nil {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "datos inválidos"})
			return
		}
		res, _, err := h.service.SaveSticker(telephon, input.URL, ctx.Request.Context())
		if err != nil {
			respondStickerError(ctx, err)
			return
		}
		ctx.JSON(http.StatusOK, res)
	}
}

// HandlerListStickers devuelve {mine, favorites, recents} en una sola llamada.
func (h *HandlerSticker) HandlerListStickers() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon := ctx.GetString("telephon")
		if telephon == "" {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "error al obtener los datos"})
			return
		}
		lib, err := h.service.ListStickers(telephon, ctx.Request.Context())
		if err != nil {
			respondStickerError(ctx, err)
			return
		}
		ctx.JSON(http.StatusOK, lib)
	}
}

// HandlerSetFavorite marca/desmarca {url, favorite} (204).
func (h *HandlerSticker) HandlerSetFavorite() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon := ctx.GetString("telephon")
		if telephon == "" {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "error al obtener los datos"})
			return
		}
		var input models.StickerFavoriteInput
		if err := ctx.ShouldBindJSON(&input); err != nil {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "datos inválidos"})
			return
		}
		if err := h.service.SetFavorite(telephon, input.URL, input.Favorite, ctx.Request.Context()); err != nil {
			respondStickerError(ctx, err)
			return
		}
		noContent(ctx)
	}
}

// HandlerDeleteSticker borra (soft) un sticker propio: 204, o 404 si no existe
// o es de otro usuario (nunca 403, para no filtrar ids ajenos).
func (h *HandlerSticker) HandlerDeleteSticker() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon := ctx.GetString("telephon")
		id, err := strconv.ParseUint(ctx.Param("id"), 10, 64)
		if telephon == "" || err != nil || id == 0 {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "datos inválidos"})
			return
		}
		if err := h.service.DeleteSticker(telephon, uint(id), ctx.Request.Context()); err != nil {
			respondStickerError(ctx, err)
			return
		}
		noContent(ctx)
	}
}
