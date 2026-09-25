package middleware

import (
	"gorm/backend/utils"
	"net/http"

	"github.com/gin-gonic/gin"
)

// MiddlewareTokenWithTelephon valida el access token de la cookie "token" y
// deja en el contexto el username y el telephon del usuario autenticado.
func MiddlewareTokenWithTelephon() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		tokenCookie, err := ctx.Cookie("token")
		if err != nil || tokenCookie == "" {
			ctx.JSON(http.StatusUnauthorized, gin.H{
				"error": "token no encontrado",
			})
			ctx.Abort()
			return
		}

		username, telephon, err := utils.DecodeToken(tokenCookie)
		if err != nil {
			ctx.JSON(http.StatusUnauthorized, gin.H{
				"error": "token invalido",
			})
			ctx.Abort()
			return
		}

		ctx.Set("username", username)
		ctx.Set("telephon", telephon)
		ctx.Next()
	}
}
