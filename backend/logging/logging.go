// Package logging provee helpers de logging estructurado compartidos entre los
// middlewares HTTP y los handlers/servicios que reciben un context.Context.
package logging

import (
	"context"
	"log/slog"
)

// requestIDKey es la clave no exportada del request id en el context.Context.
// Al no exportarse, solo este paquete puede escribir y leer el valor.
type requestIDKey struct{}

// WithRequestID devuelve un contexto que transporta el request id.
func WithRequestID(ctx context.Context, id string) context.Context {
	if ctx == nil || id == "" {
		return ctx
	}
	return context.WithValue(ctx, requestIDKey{}, id)
}

// RequestID devuelve el request id transportado por ctx, o "" si no hay.
func RequestID(ctx context.Context) string {
	if ctx == nil {
		return ""
	}
	id, _ := ctx.Value(requestIDKey{}).(string)
	return id
}

// FromContext devuelve el logger por defecto enriquecido con el request id de
// ctx. Los handlers pasan *gin.Context como context.Context
// (ContextWithFallback), de modo que el id guardado en el request context
// también es visible desde aquí.
func FromContext(ctx context.Context) *slog.Logger {
	if id := RequestID(ctx); id != "" {
		return slog.Default().With("request_id", id)
	}
	return slog.Default()
}
