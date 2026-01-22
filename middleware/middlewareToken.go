package middleware

import (
	"gorm/utils"
	"net/http"

	"github.com/gin-gonic/gin"
)

func MiddlewareTokenValidation() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		tokenCookie, err := ctx.Cookie("token")
		if err != nil {
			ctx.JSON(http.StatusFound, gin.H{
				"error":"token no encontrado",
			})
			ctx.Abort()
			return 
		}

		username, err := utils.DecodeToken(tokenCookie)
		if err != nil {
			ctx.JSON(http.StatusNonAuthoritativeInfo, gin.H{
				"error":"token invalido",
			})
			ctx.Abort()
			return 
		}
		ctx.Set("username", username)
		ctx.Next()
	}
}