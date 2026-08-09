package middleware

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
)

// MiddlewareCallToken extrae y valida el parámetro :roomID de la URL
// para la generación de tokens de ZegoCloud.
func MiddlewareCallToken() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		roomID := ctx.Param("roomID")
		if len(roomID) == 0 {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "roomID es requerido"})
			ctx.Abort()
			return
		}
		ctx.Set("roomID", roomID)
		ctx.Next()
	}
}

// MiddlewareDeleteCallLog extrae y valida el parámetro :id de la URL (uint)
// para eliminar un registro de llamada.
func MiddlewareDeleteCallLog() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		idStr := ctx.Param("id")
		if len(idStr) == 0 {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "El id es requerido"})
			ctx.Abort()
			return
		}
		var id uint64
		if _, err := fmt.Sscanf(idStr, "%d", &id); err != nil || id == 0 {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "id inválido"})
			ctx.Abort()
			return
		}
		ctx.Set("callID", uint(id))
		ctx.Next()
	}
}
