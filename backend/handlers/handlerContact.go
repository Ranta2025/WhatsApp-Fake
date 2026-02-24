package handlers

import (
	"gorm/backend/models"
	"gorm/backend/services"
	"gorm/backend/utils"
	"gorm/backend/websocket"
	"log"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
)

type HandlerContact struct {
	service *services.ServiceApiContact
	hub     *websocket.Hub
}

func InitHandlerApiMessage(services *services.ServiceApiContact, hub *websocket.Hub) *HandlerContact {
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
		ctx.IndentedJSON(200, user)
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

		user, oldUsername, err := hd.service.ServicePutUserByTelephon(userTelephon, newUsername, ctx)
		if err != nil {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"error": err.Error(),
			})
			ctx.Abort()
			return
		}

		// Notificar a los contactos sobre el cambio de username
		if hd.hub != nil {
			hd.hub.NotifyUsernameChange(oldUsername, newUsername)
		}

		token, err := utils.GenerateToken(user.Username, user.Telephon)
		if err != nil {
			log.Printf("[HANDLER] Error generando token: %v", err)
			ctx.JSON(http.StatusInternalServerError, gin.H{
				"error": "error interno del servidor",
			})
			ctx.Abort()
			return
		}
		secure := os.Getenv("ENV") == "production"
		ctx.SetSameSite(http.SameSiteLaxMode)
		ctx.SetCookie("token", token, int(utils.AccessTokenDuration.Seconds()), "/", "", secure, true)
		ctx.JSON(200, gin.H{
			"message": user,
			"token":   token,
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

		// En el flujo WhatsApp NO se notifica al receptor cuando alguien lo agrega
		// El receptor solo se entera cuando recibe un mensaje

		ctx.JSON(201, gin.H{
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

		ctx.IndentedJSON(200, contacts)
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
		ctx.JSON(200, gin.H{
			"contact": contact,
		})
	}
}
