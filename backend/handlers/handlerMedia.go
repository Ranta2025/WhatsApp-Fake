package handlers

import (
	"gorm/backend/models"
	"gorm/backend/services"
	"net/http"

	"github.com/gin-gonic/gin"
)

type HandlerMedia struct {
	service services.MediaServicer
}

func InitHandlerMedia(service services.MediaServicer) *HandlerMedia {
	return &HandlerMedia{service: service}
}

func (hm *HandlerMedia) HandlerUploadMedia() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		if err := ctx.Request.ParseMultipartForm(110 << 20); err != nil {
			// C3: el detalle del error de parsing queda en logs; el cliente
			// recibe un mensaje seguro.
			respondError(ctx, http.StatusBadRequest, models.NewAppError(http.StatusBadRequest, "error al parsear el formulario", err))
			return
		}

		file, header, err := ctx.Request.FormFile("file")
		if err != nil {
			respondErrorMsg(ctx, http.StatusBadRequest, "campo 'file' requerido")
			return
		}
		defer file.Close()

		result, err := hm.service.UploadMedia(file, header, ctx)
		if err != nil {
			// El mensaje del servicio puede incluir errores internos de
			// almacenamiento (%w): se sanea, el detalle queda en logs.
			respondError(ctx, http.StatusBadRequest, err)
			return
		}

		ctx.JSON(http.StatusOK, gin.H{
			"url":       result.URL,
			"mediaType": result.MediaType,
			"mimeType":  result.MimeType,
			"size":      result.Size,
			"filename":  result.Filename,
		})
	}
}
