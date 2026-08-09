package middleware

import (
	"log/slog"
	"time"

	"github.com/gin-gonic/gin"
)

// TimeMiddleware registra el método HTTP, ruta, código de estado y duración de
// cada request en los logs del servidor.
func TimeMiddleware() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		start := time.Now()
		method := ctx.Request.Method
		path := ctx.Request.URL.Path

		ctx.Next()

		duration := time.Since(start)
		status := ctx.Writer.Status()

		slog.Info("Request completed",
			"method", method,
			"path", path,
			"status", status,
			"duracion_ms", duration.Milliseconds(),
			"duracion", duration.String(),
		)
	}
}
