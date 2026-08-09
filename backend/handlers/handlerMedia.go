package handlers

import (
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
			ctx.JSON(http.StatusBadRequest, gin.H{
				"error": "error al parsear el formulario: " + err.Error(),
			})
			ctx.Abort()
			return
		}

		file, header, err := ctx.Request.FormFile("file")
		if err != nil {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"error": "campo 'file' requerido",
			})
			ctx.Abort()
			return
		}
		defer file.Close()

		result, err := hm.service.UploadMedia(file, header, ctx)
		if err != nil {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"error": err.Error(),
			})
			ctx.Abort()
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
