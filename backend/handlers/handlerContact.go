package handlers

import (
	"gorm/backend/models"
	"gorm/backend/services"
	"gorm/backend/utils"
	"gorm/backend/websocket"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
)

type HandlerContact struct {
	service services.ContactServicer
	hub     *websocket.Hub
}

func InitHandlerApiMessage(services services.ContactServicer, hub *websocket.Hub) *HandlerContact {
	return &HandlerContact{
		service: services,
		hub:     hub,
	}
}

func (hd *HandlerContact) HandlerGetUser() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exist := ctx.Get("telephon")
		if !exist {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"error": "error al obtener datos",
			})
			ctx.Abort()
			return
		}
		user, err := hd.service.ServicesGetUserByTelephon(telephon.(string), ctx)
		if err != nil {
			ctx.JSON(http.StatusNotFound, gin.H{
				"error": err.Error(),
			})
			ctx.Abort()
			return
		}
		ctx.IndentedJSON(http.StatusOK, user)
	}
}

func (hd *HandlerContact) HandlerPutUser() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exist := ctx.Get("telephon")
		usernameUpedate, exist2 := ctx.Get("usernameUpdate")
		if !exist || !exist2 {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"error": "error al obtener datos",
			})
			ctx.Abort()
			return
		}

		userTelephon := telephon.(string)
		newUsername := usernameUpedate.(string)

		user, oldUsername, token, err := hd.service.ServiceUpdateUsername(userTelephon, newUsername, ctx)
		if err != nil {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"error": err.Error(),
			})
			ctx.Abort()
			return
		}

		if hd.hub != nil {
			hd.hub.NotifyUsernameChange(oldUsername, newUsername)
		}

		secure := os.Getenv("ENV") == "production"
		ctx.SetSameSite(http.SameSiteLaxMode)
		ctx.SetCookie("token", token, int(utils.AccessTokenDuration.Seconds()), "/", "", secure, true)
		ctx.JSON(http.StatusOK, gin.H{
			"message": user,
		})
	}
}

func (hd *HandlerContact) HandlerAddContact() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exist := ctx.Get("telephon")
		contactAdd, exist2 := ctx.Get("contactAdd")
		if !exist || !exist2 {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"error": "error al obtener datos",
			})
			ctx.Abort()
			return
		}

		contact, err := hd.service.AddContactByTelephon(telephon.(string), contactAdd.(models.ContactAdd), ctx)
		if err != nil {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"error": err.Error(),
			})
			ctx.Abort()
			return
		}

		ctx.JSON(http.StatusCreated, gin.H{
			"contact": contact,
		})
	}
}

func (hd *HandlerContact) HandlerContacts() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exist := ctx.Get("telephon")
		if !exist {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"error": "error al obtener datos",
			})
			ctx.Abort()
			return
		}

		contacts, err := hd.service.ServiceGetContactsByTelephon(telephon.(string), ctx)
		if err != nil {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"error": err.Error(),
			})
			ctx.Abort()
			return
		}

		ctx.IndentedJSON(http.StatusOK, contacts)
	}
}

func (hd *HandlerContact) HandlerPutContact() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		contact, exist := ctx.Get("contactPut")
		number, exist2 := ctx.Get("telephon")
		if !(exist && exist2) {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"error": "error al obtener datos",
			})
			ctx.Abort()
			return
		}
		putContact := models.ContactPut{
			Number:        number.(string),
			GetContactPut: contact.(models.GetContactPut)}

		contact, err := hd.service.ServicePutContactByTelephon(putContact, ctx)
		if err != nil {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"error": err.Error(),
			})
			ctx.Abort()
			return
		}
		ctx.JSON(http.StatusOK, gin.H{
			"contact": contact,
		})
	}
}

func (hd *HandlerContact) HandlerUpdateAvatar() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exist := ctx.Get("telephon")
		avatarUrl, exist2 := ctx.Get("avatarUrl")
		if !exist || !exist2 {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "error al obtener datos"})
			ctx.Abort()
			return
		}

		url := avatarUrl.(string)
		if err := hd.service.ServiceUpdateAvatar(telephon.(string), url, ctx); err != nil {
			ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			ctx.Abort()
			return
		}

		if hd.hub != nil {
			hd.hub.NotifyAvatarChange(telephon.(string), url)
		}

		ctx.JSON(http.StatusOK, gin.H{"message": "avatar actualizado", "avatar_url": url})
	}
}

func (hd *HandlerContact) HandlerUpdateWallpaper() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exist := ctx.Get("telephon")
		if !exist {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "error al obtener datos"})
			ctx.Abort()
			return
		}

		var body struct {
			WallpaperUrl string `json:"wallpaper_url"`
		}
		if err := ctx.ShouldBindJSON(&body); err != nil {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "datos inválidos"})
			ctx.Abort()
			return
		}

		if err := hd.service.ServiceUpdateWallpaper(telephon.(string), body.WallpaperUrl, ctx); err != nil {
			ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			ctx.Abort()
			return
		}

		ctx.JSON(http.StatusOK, gin.H{"message": "fondo actualizado", "wallpaper_url": body.WallpaperUrl})
	}
}

func (hd *HandlerContact) HandlerUpdateContactWallpaper() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exist := ctx.Get("telephon")
		if !exist {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "error al obtener datos"})
			ctx.Abort()
			return
		}

		var body struct {
			ContactTelephon string `json:"contact_telephon" binding:"required"`
			WallpaperUrl    string `json:"wallpaper_url"`
		}
		if err := ctx.ShouldBindJSON(&body); err != nil {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "contact_telephon requerido"})
			ctx.Abort()
			return
		}

		if err := hd.service.ServiceUpdateContactWallpaper(telephon.(string), body.ContactTelephon, body.WallpaperUrl, ctx); err != nil {
			ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			ctx.Abort()
			return
		}

		ctx.JSON(http.StatusOK, gin.H{"message": "fondo del chat actualizado", "wallpaper_url": body.WallpaperUrl})
	}
}
