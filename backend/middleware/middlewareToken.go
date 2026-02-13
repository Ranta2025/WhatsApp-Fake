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
		log.Printf("[MIDDLEWARE] === Validación de Token ===")
		log.Printf("[MIDDLEWARE] Path: %s", ctx.Request.URL.Path)
		log.Printf("[MIDDLEWARE] Method: %s", ctx.Request.Method)

		tokenCookie, err := ctx.Cookie("token")
		log.Printf("[MIDDLEWARE] Cookie error: %v, Token presente: %v", err, tokenCookie != "")

		if err != nil || tokenCookie == "" {
			// Fallback: Authorization: Bearer <token>
			authHeader := ctx.GetHeader("Authorization")
			log.Printf("[MIDDLEWARE] Cookie no encontrada, verificando Authorization header: %v", authHeader != "")
			if strings.HasPrefix(authHeader, "Bearer ") {
				tokenCookie = strings.TrimPrefix(authHeader, "Bearer ")
				log.Printf("[MIDDLEWARE] Token extraido de Authorization header")
			} else {
				// Fallback para WebSocket: query parameter token
				tokenQuery := ctx.Query("token")
				log.Printf("[MIDDLEWARE] Authorization header no válido, verificando query param. Token query presente: %v", tokenQuery != "")
				if tokenQuery != "" {
					tokenCookie = tokenQuery
					log.Printf("[MIDDLEWARE] Token extraido de query parameter: %s...", tokenQuery[:min(10, len(tokenQuery))])
				}
			}
		} else {
			log.Printf("[MIDDLEWARE] Token encontrado en cookie")
		}

		if tokenCookie == "" {
			log.Printf("[MIDDLEWARE] ERROR: No se encontró token en ninguna fuente")
			ctx.JSON(http.StatusUnauthorized, gin.H{
				"error": "token no encontrado",
			})
			ctx.Abort()
			return
		}

		username, err := utils.DecodeToken(tokenCookie)
		if err != nil {
			log.Printf("[MIDDLEWARE] ERROR: Token inválido - %v", err)
			ctx.JSON(http.StatusUnauthorized, gin.H{
				"error": "token invalido",
			})
			ctx.Abort()
			return
		}
		log.Printf("[MIDDLEWARE] Token válido para usuario: %s", username)
		ctx.Set("username", username)
		ctx.Next()
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
