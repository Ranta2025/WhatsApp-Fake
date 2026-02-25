package middleware

import (
	"gorm/backend/models"
	"net/http"

	"github.com/gin-gonic/gin"
)

// MiddlewareUpdateAvatar valida el JSON de actualización de foto de perfil.
func MiddlewareUpdateAvatar() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		var body struct {
			AvatarUrl string `json:"avatar_url" binding:"required"`
		}
		if err := ctx.ShouldBindJSON(&body); err != nil {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "avatar_url es requerido"})
			ctx.Abort()
			return
		}
		if len(body.AvatarUrl) == 0 {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "avatar_url no puede estar vacío"})
			ctx.Abort()
			return
		}
		ctx.Set("avatarUrl", body.AvatarUrl)
		ctx.Next()
	}
}

// MiddlewareContact valida el JSON de creación de contacto:
// número en formato E.164 y nombre no vacío.
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

		// La validación de formato E.164 ya se hace en el binding del modelo

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

// MiddlewarePutContact valida el JSON de actualización de nombre de contacto.
func MiddlewarePutContact() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		var contactPut models.GetContactPut
		if err := ctx.ShouldBindJSON(&contactPut); err != nil {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"error": "Datos incompletos: se requiere número y nuevo nombre del contacto",
			})
			ctx.Abort()
			return
		}
		// La validación de formato E.164 ya se hace en el binding del modelo
		if len(contactPut.ContactName) == 0 {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"error": "El nuevo nombre del contacto no puede estar vacío",
			})
			ctx.Abort()
			return
		}
		ctx.Set("contactPut", contactPut)
		ctx.Next()
	}
}
