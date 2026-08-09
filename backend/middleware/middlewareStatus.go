package middleware

import (
	"net/http"
	"strings"

	"gorm/backend/models"

	"github.com/gin-gonic/gin"
)

func MiddlewareStatusCreate() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		var body models.StatusCreate
		if err := ctx.ShouldBindJSON(&body); err != nil {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "datos inválidos para publicar el estado"})
			ctx.Abort()
			return
		}
		body.Text = strings.TrimSpace(body.Text)
		body.MediaUrl = strings.TrimSpace(body.MediaUrl)
		body.MediaType = strings.TrimSpace(body.MediaType)
		body.Background = strings.TrimSpace(body.Background)
		if body.Text == "" && body.MediaUrl == "" {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "escribe algo o adjunta una foto o video"})
			ctx.Abort()
			return
		}
		if len(body.Text) > 700 {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "el texto no puede exceder los 700 caracteres"})
			ctx.Abort()
			return
		}
		if len(body.MediaUrl) > 2048 {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "la URL del medio no puede exceder los 2048 caracteres"})
			ctx.Abort()
			return
		}
		ctx.Set("statusCreate", body)
		ctx.Next()
	}
}
