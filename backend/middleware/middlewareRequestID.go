package middleware

import (
	"regexp"

	"gorm/backend/logging"

	"github.com/gin-gonic/gin"
	"github.com/rs/xid"
)

// requestIDHeader es la cabecera entrante/saliente que transporta el request id.
const requestIDHeader = "X-Request-ID"

// requestIDGinKey es la clave del request id en el context de Gin.
const requestIDGinKey = "requestID"

// requestIDPattern acepta ids entrantes seguros y acotados: 1..64 caracteres
// alfanuméricos más . _ -. Cualquier otra cosa se reemplaza por un id generado,
// para evitar inyección de logs o abuso de cabeceras.
var requestIDPattern = regexp.MustCompile(`^[A-Za-z0-9._-]{1,64}$`)

// RequestID lee un X-Request-ID entrante válido o genera uno nuevo, lo guarda
// en el context de Gin y en el context de la request (para que los servicios
// que reciben el *gin.Context como context.Context lo vean) y lo devuelve en la
// respuesta.
func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.GetHeader(requestIDHeader)
		if !requestIDPattern.MatchString(id) {
			id = xid.New().String()
		}
		c.Set(requestIDGinKey, id)
		c.Request = c.Request.WithContext(logging.WithRequestID(c.Request.Context(), id))
		c.Writer.Header().Set(requestIDHeader, id)
		c.Next()
	}
}
