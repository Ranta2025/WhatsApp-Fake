package handlers

import (
	"log/slog"

	"gorm/backend/models"

	"github.com/gin-gonic/gin"
)

// requestIDFromCtx recupera el request_id del contexto (lo setea el middleware
// de request-id; hasta que exista devuelve "").
func requestIDFromCtx(c *gin.Context) string {
	if rid, ok := c.Get("request_id"); ok {
		if s, ok := rid.(string); ok {
			return s
		}
	}
	return ""
}

// respondJSON responde un éxito con el envelope uniforme:
// {"success": true, "data": ..., "request_id": "..."}.
func respondJSON(c *gin.Context, status int, data interface{}) {
	c.JSON(status, gin.H{
		"success":    status < 400,
		"data":       data,
		"request_id": requestIDFromCtx(c),
	})
}

// respondErrorMsg responde un error cuyo mensaje ya es seguro para el cliente
// (literal del handler o validación). Nunca recibe errores internos: para eso
// está respondError.
func respondErrorMsg(c *gin.Context, status int, message string) {
	c.JSON(status, gin.H{
		"success":    false,
		"error":      message,
		"request_id": requestIDFromCtx(c),
	})
	c.Abort()
}

// respondError responde un error sanitizado (C3): si err es un *models.AppError
// se usa su Message; cualquier otro error se convierte en "internal server
// error". El error real se registra con slog y request_id — nunca viaja al body.
func respondError(c *gin.Context, status int, err error) {
	msg := models.SafeMessage(err)
	slog.Error("error en handler", "status", status, "error", err, "request_id", requestIDFromCtx(c))
	respondErrorMsg(c, status, msg)
}
