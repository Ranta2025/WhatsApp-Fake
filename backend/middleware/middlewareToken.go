package middleware

import (
	"log/slog"
	"net/http"

	"gorm/backend/utils"

	"github.com/gin-gonic/gin"
)

func MiddlewareTokenWithTelephon() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		slog.Debug("[MIDDLEWARE] Validación de Token con Telephon", "path", ctx.Request.URL.Path)

		tokenCookie, err := ctx.Cookie("token")
		if err != nil || tokenCookie == "" {
			slog.Debug("[MIDDLEWARE] Cookie 'token' no encontrada")
			ctx.JSON(http.StatusUnauthorized, gin.H{
				"error": "token no encontrado",
			})
			ctx.Abort()
			return
		}

		// Decodificar el token para obtener username y telephon
		username, telephon, err := utils.DecodeToken(tokenCookie)
		if err != nil {
			slog.Debug("[MIDDLEWARE] Token inválido", "error", err)
			ctx.JSON(http.StatusUnauthorized, gin.H{
				"error": "token invalido",
			})
			ctx.Abort()
			return
		}
		slog.Debug("token validado", "username", username)

		ctx.Set("username", username)
		ctx.Set("telephon", telephon)
		ctx.Next()
	}
}
