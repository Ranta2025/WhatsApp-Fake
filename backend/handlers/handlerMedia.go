package handlers

import (
	"gorm/backend/services"
	"net/http"

	"github.com/gin-gonic/gin"
)

type HandlerMedia struct {
	service *services.ServiceMedia
}

// InitHandlerMedia crea el handler de subida de archivos multimedia.
func InitHandlerMedia(service *services.ServiceMedia) *HandlerMedia {
	return &HandlerMedia{service: service}
}

// HandlerUploadMedia sube un archivo multimedia (imagen/audio/video/documento)
// a MinIO y devuelve la URL pública junto con metadatos del archivo.
func (hm *HandlerMedia) HandlerUploadMedia() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		// Parsear multipart form (límite 110 MB = máximo video + overhead)
		if err := ctx.Request.ParseMultipartForm(110 << 20); err != nil {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"error": "error al parsear el formulario: " + err.Error(),
			})
			return
		}

		file, header, err := ctx.Request.FormFile("file")
		if err != nil {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"error": "campo 'file' requerido",
			})
			return
		}
		defer file.Close()

		result, err := hm.service.UploadMedia(file, header, ctx)
		if err != nil {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"error": err.Error(),
			})
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
