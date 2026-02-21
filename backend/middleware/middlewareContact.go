package middleware

import (
	"gorm/backend/models"
	"net/http"

	"github.com/gin-gonic/gin"
)

func MiddlewareContact() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		var contactAdd models.ContactAdd
		if err := ctx.ShouldBindJSON(&contactAdd); err != nil {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"error": "Datos incompletos: se requiere número y nombre del contacto",
			})
			ctx.Abort()
			return
		}

		if len(contactAdd.Number) != 8 {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"error": "El número de teléfono debe contener 8 caracteres",
			})
			ctx.Abort()
			return
		}

		if len(contactAdd.ContactName) == 0 {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"error": "El nombre del contacto no puede estar vacío",
			})
			ctx.Abort()
			return
		}

		ctx.Set("contactAdd", contactAdd)
		ctx.Next()
	}
}
