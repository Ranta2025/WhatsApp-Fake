package middleware

import (
	"gorm/backend/utils"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
)

func MiddlewareTokenWithTelephon() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		log.Printf("[MIDDLEWARE] === Validación de Token con Telephon ===")
		log.Printf("[MIDDLEWARE] Path: %s", ctx.Request.URL.Path)

		tokenCookie, err := ctx.Cookie("token")
		if err != nil || tokenCookie == "" {
			log.Printf("[MIDDLEWARE] ERROR: Cookie 'token' no encontrada")
			ctx.JSON(http.StatusUnauthorized, gin.H{
				"error": "token no encontrado",
			})
			ctx.Abort()
			return
		}

		// Decodificar el token para obtener username y telephon
		username, telephon, err := utils.DecodeToken(tokenCookie)
		if err != nil {
			log.Printf("[MIDDLEWARE] ERROR: Token inválido - %v", err)
			ctx.JSON(http.StatusUnauthorized, gin.H{
				"error": "token invalido",
			})
			ctx.Abort()
			return
		}
		log.Printf("[MIDDLEWARE] Token válido para usuario: %s, telephon: %s", username, telephon)

		ctx.Set("username", username)
		ctx.Set("telephon", telephon)
		ctx.Next()
	}
}