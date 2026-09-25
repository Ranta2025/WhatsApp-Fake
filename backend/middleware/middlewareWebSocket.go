package middleware

import (
	"context"
	"gorm/backend/utils"
	"net/http"

	"github.com/gin-gonic/gin"
)

// WSTicketConsumer valida tickets de un solo uso para el WebSocket.
type WSTicketConsumer interface {
	Consume(ctx context.Context, ticket string) (username string, telephon string, err error)
}

// MiddlewareWebSocketAuth autentica la conexión WebSocket con un ticket de un
// solo uso (?ticket=..., para frontends en otro dominio) o, si no lo hay, con
// la cookie de sesión "token" (mismo dominio).
func MiddlewareWebSocketAuth(tickets WSTicketConsumer) gin.HandlerFunc {
	return func(ctx *gin.Context) {
		if ticket := ctx.Query("ticket"); ticket != "" && tickets != nil {
			username, telephon, err := tickets.Consume(ctx.Request.Context(), ticket)
			if err != nil {
				ctx.JSON(http.StatusUnauthorized, gin.H{"error": "ticket invalido"})
				ctx.Abort()
				return
			}
			ctx.Set("username", username)
			ctx.Set("telephon", telephon)
			ctx.Next()
			return
		}

		tokenCookie, err := ctx.Cookie("token")
		if err != nil || tokenCookie == "" {
			ctx.JSON(http.StatusUnauthorized, gin.H{"error": "token no encontrado"})
			ctx.Abort()
			return
		}
		username, telephon, err := utils.DecodeToken(tokenCookie)
		if err != nil {
			ctx.JSON(http.StatusUnauthorized, gin.H{"error": "token invalido"})
			ctx.Abort()
			return
		}
		ctx.Set("username", username)
		ctx.Set("telephon", telephon)
		ctx.Next()
	}
}
