package middleware

import (
	"gorm/backend/utils"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// MiddlewareWebSocketAuth valida token para conexión WebSocket
func MiddlewareWebSocketAuth() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		// Obtener token de la cookie
		token, err := ctx.Cookie("token")
		if err != nil || token == "" {
			// Fallback: Authorization: Bearer <token>
			authHeader := ctx.GetHeader("Authorization")
			if strings.HasPrefix(authHeader, "Bearer ") {
				token = strings.TrimPrefix(authHeader, "Bearer ")
			}
		}
		if token == "" {
			// Fallback: query param ?token=...
			token = ctx.Query("token")
		}
		if token == "" {
			ctx.JSON(http.StatusUnauthorized, gin.H{
				"error": "Token no encontrado",
			})
			ctx.Abort()
			return
		}

		// Validar token
		username, err := utils.DecodeToken(token)
		if err != nil {
			ctx.JSON(http.StatusUnauthorized, gin.H{
				"error": "Token inválido",
			})
			ctx.Abort()
			return
		}

		// Guardar username en contexto
		ctx.Set("username", username)
		ctx.Next()
	}
}
