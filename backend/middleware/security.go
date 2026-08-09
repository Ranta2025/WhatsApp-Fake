package middleware

import (
	"github.com/gin-gonic/gin"
)

// SecurityHeaders agrega las cabeceras de seguridad a TODAS las respuestas:
//   - Content-Security-Policy          (spec R1)
//   - Strict-Transport-Security        (spec R2)
//   - X-Frame-Options: DENY            (spec R3)
//   - X-Content-Type-Options: nosniff  (spec R4)
//
// Se aplica globalmente en main.go, antes de las rutas.
func SecurityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
		c.Header("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		c.Header("X-Frame-Options", "DENY")
		c.Header("X-Content-Type-Options", "nosniff")
		c.Next()
	}
}
