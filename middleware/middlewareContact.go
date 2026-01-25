package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func MiddlewareContact() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		var number string
		if err := ctx.ShouldBindJSON(&number); err != nil {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"error": "Introdusca numero",
			})
			ctx.Abort()
			return
		}

		if len(number) != 8 {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"error": "El numero de telefono tiene que contener 8 caracteres",
			})
			ctx.Abort()
			return
		}

		ctx.Set("number", number)
	}
}