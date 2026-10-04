package handlers

import (
	"gorm/backend/services"
	"net/http"

	"github.com/gin-gonic/gin"
)

// maxUploadBody es el tamaño máximo del cuerpo de una subida.
const maxUploadBody = 110 << 20

type HandlerMedia struct {
	service services.MediaServicer
}

// InitHandlerMedia crea el handler de subida de archivos multimedia.
func InitHandlerMedia(service services.MediaServicer) *HandlerMedia {
	return &HandlerMedia{service: service}
}

// HandlerUploadMedia sube un archivo multimedia (imagen/audio/video/documento)
// a MinIO y devuelve la URL pública junto con metadatos del archivo.
func (hm *HandlerMedia) HandlerUploadMedia() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		// Limitar el tamaño TOTAL del cuerpo (110 MB = máximo video + overhead).
		// ParseMultipartForm solo limita lo que se guarda en memoria; sin
		// MaxBytesReader un cliente podría enviar un cuerpo arbitrariamente grande.
		ctx.Request.Body = http.MaxBytesReader(ctx.Writer, ctx.Request.Body, maxUploadBody)
		if err := ctx.Request.ParseMultipartForm(32 << 20); err != nil {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"error": "archivo demasiado grande o formulario inválido",
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

		result, err := hm.service.UploadMedia(file, header, ctx.Request.Context())
		if err != nil {
			respondFailure(ctx, http.StatusBadRequest, err)
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
