package middleware

import (
	"log/slog"
	"time"

	"gorm/backend/logging"

	"github.com/gin-gonic/gin"
)

// TimeMiddleware registra el método HTTP, ruta, código de estado y duración de
// cada request en los logs del servidor. Conserva los nombres de campo
// originales (method, path, status, duracion_ms, duracion) y añade request_id,
// route (plantilla), client_ip y bytes. No registra PII (ni teléfonos, ni
// usuarios, ni cuerpos).
func TimeMiddleware() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		start := time.Now()
		method := ctx.Request.Method
		path := ctx.Request.URL.Path

		ctx.Next()

		duration := time.Since(start)
		status := ctx.Writer.Status()

		logging.FromContext(ctx.Request.Context()).LogAttrs(
			ctx.Request.Context(),
			accessLogLevel(path, status),
			"Request completed",
			slog.String("method", method),
			slog.String("path", path),
			slog.Int("status", status),
			slog.Int64("duracion_ms", duration.Milliseconds()),
			slog.String("duracion", duration.String()),
			slog.String("route", ctx.FullPath()),
			slog.String("client_ip", ctx.ClientIP()),
			slog.Int("bytes", ctx.Writer.Size()),
		)
	}
}

// accessLogLevel elige el nivel según el estado: 5xx Error, 4xx Warn, /healthz
// Debug (para no inundar con los healthchecks) y el resto Info.
func accessLogLevel(path string, status int) slog.Level {
	switch {
	case path == "/healthz":
		return slog.LevelDebug
	case status >= 500:
		return slog.LevelError
	case status >= 400:
		return slog.LevelWarn
	default:
		return slog.LevelInfo
	}
}
