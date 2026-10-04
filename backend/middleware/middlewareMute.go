package middleware

import (
	"gorm/backend/models"

	"github.com/gin-gonic/gin"
)

// MiddlewareMuteDuration decodifica el cuerpo de PUT .../mute
// ({"duration": "8h"|"1w"|"always"}) y deja la duración en "muteDuration".
// Un cuerpo que no es JSON válido es 400 aquí; el valor lo valida el servicio.
func MiddlewareMuteDuration() gin.HandlerFunc {
	return func(c *gin.Context) {
		var body models.MuteInput
		if !bindPushJSON(c, &body) {
			return
		}
		c.Set("muteDuration", body.Duration)
		c.Next()
	}
}
