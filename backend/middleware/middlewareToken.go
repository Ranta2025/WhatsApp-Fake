package middleware

import (
	"gorm/backend/utils"
	"log"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

func MiddlewareTokenValidation() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		tokenCookie, err := ctx.Cookie("token")
		log.Printf("[MIDDLEWARE] Intentando obtener token - Cookie error: %v, Token: %v", err, tokenCookie != "")
		if err != nil || tokenCookie == "" {
			// Fallback: Authorization: Bearer <token>
			authHeader := ctx.GetHeader("Authorization")
			log.Printf("[MIDDLEWARE] Cookie no encontrada, verificando Authorization header: %v", authHeader != "")
			if strings.HasPrefix(authHeader, "Bearer ") {
				tokenCookie = strings.TrimPrefix(authHeader, "Bearer ")
				log.Printf("[MIDDLEWARE] Token extraido de Authorization header")
			}
		}
		if tokenCookie == "" {
			ctx.JSON(http.StatusUnauthorized, gin.H{
				"error": "token no encontrado",
			})
			ctx.Abort()
			return
		}

		username, err := utils.DecodeToken(tokenCookie)
		if err != nil {
			ctx.JSON(http.StatusUnauthorized, gin.H{
				"error": "token invalido",
			})
			ctx.Abort()
			return
		}
		ctx.Set("username", username)
		ctx.Next()
	}
}
