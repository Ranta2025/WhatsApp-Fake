package middleware

import (
	"net/http"
	"runtime/debug"

	"gorm/backend/logging"

	"github.com/gin-gonic/gin"
)

// Recovery reemplaza gin.Recovery: registra el panic con su stack y el
// request_id vía slog y responde el mismo 500 JSON que el resto de la API.
// Se pasa writer nil para que Gin no emita su propio log sin estructura: el
// único log del panic es el de slog.
func Recovery() gin.HandlerFunc {
	return gin.CustomRecoveryWithWriter(nil, func(c *gin.Context, err any) {
		logging.FromContext(c.Request.Context()).Error("panic recovered",
			"panic", err,
			"stack", string(debug.Stack()),
		)
		c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{
			"error": "error interno del servidor",
		})
	})
}
