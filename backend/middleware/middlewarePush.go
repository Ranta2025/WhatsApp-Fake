package middleware

import (
	"gorm/backend/models"
	"gorm/backend/utils"
	"net/http"

	"github.com/gin-gonic/gin"
)

// maxPushBodyBytes acota el cuerpo de las peticiones de push: una suscripción
// real (endpoint <= 1024 + claves) ocupa bastante menos de 4 KiB.
const maxPushBodyBytes = 4 << 10

// bindPushJSON limita el cuerpo y lo decodifica en dst; si falla responde 400.
func bindPushJSON(c *gin.Context, dst any) bool {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxPushBodyBytes)
	if err := c.ShouldBindJSON(dst); err != nil {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "cuerpo de la petición inválido"})
		return false
	}
	return true
}

// MiddlewarePushSubscribe valida el cuerpo de POST push/subscribe, que es el
// JSON de PushSubscription.toJSON() del navegador (expirationTime se ignora).
// El endpoint debe estar en la allowlist de servicios de push (anti-SSRF: el
// backend hará POST a esa URL) y las claves deben ser base64url del tamaño
// correcto. Deja el cuerpo en "pushSubscription".
func MiddlewarePushSubscribe() gin.HandlerFunc {
	return func(c *gin.Context) {
		var body models.PushSubscriptionInput
		if !bindPushJSON(c, &body) {
			return
		}
		if !utils.IsAllowedPushEndpoint(body.Endpoint) {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "endpoint de push no permitido"})
			return
		}
		if !utils.ValidPushKeys(body.Keys.P256dh, body.Keys.Auth) {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "claves de suscripción inválidas"})
			return
		}
		c.Set("pushSubscription", body)
		c.Next()
	}
}

// MiddlewarePushUnsubscribe valida el cuerpo de DELETE push/subscribe
// ({"endpoint": "..."}). No exige la allowlist: borrar solo afecta filas del
// propio usuario y así se pueden limpiar endpoints de hosts ya retirados.
func MiddlewarePushUnsubscribe() gin.HandlerFunc {
	return func(c *gin.Context) {
		var body models.PushUnsubscribeInput
		if !bindPushJSON(c, &body) {
			return
		}
		if body.Endpoint == "" || len(body.Endpoint) > utils.MaxPushEndpointLen {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "endpoint inválido"})
			return
		}
		c.Set("pushEndpoint", body.Endpoint)
		c.Next()
	}
}

// MiddlewarePushPreview valida el cuerpo de PUT push/preview
// ({"preview": true|false}); el campo es obligatorio. Deja el bool en "pushPreview".
func MiddlewarePushPreview() gin.HandlerFunc {
	return func(c *gin.Context) {
		var body models.PushPreviewInput
		if !bindPushJSON(c, &body) {
			return
		}
		if body.Preview == nil {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "el campo preview es obligatorio"})
			return
		}
		c.Set("pushPreview", *body.Preview)
		c.Next()
	}
}
