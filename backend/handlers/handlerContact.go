package handlers

import (
	"gorm/backend/models"
	"gorm/backend/services"
	"gorm/backend/utils"
	"net/http"

	"github.com/gin-gonic/gin"
)

type HandlerContact struct {
	service *services.ServiceApiContact
}

func InitHandlerApiMessage(services *services.ServiceApiContact) *HandlerContact {
	return &HandlerContact{
		service: services,
	}
}

func (hd *HandlerContact) HandlerGetUser() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		username, exist := ctx.Get("username")
		if !exist {
			ctx.JSON(http.StatusBadGateway, gin.H{
				"error": "error al obtener datos",
			})
			ctx.Abort()
			return
		}
		user, err := hd.service.ServicesGetUser(username.(string), ctx)
		if err != nil {
			ctx.JSON(http.StatusNotImplemented, gin.H{
				"message": err.Error(),
			})
			ctx.Abort()
			return
		}
		ctx.IndentedJSON(200, user)
	}
}

func (hd *HandlerContact) HandlerPutUser() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		username, exist := ctx.Get("username")
		usernameUpedate, exist2 := ctx.Get("usernameUpdate")
		if !exist || !exist2 {
			ctx.JSON(http.StatusBadGateway, gin.H{
				"message": "error al obtener datos",
			})
			ctx.Abort()
			return
		}
		user, err := hd.service.ServicePutUser(username.(string), usernameUpedate.(string), ctx)
		if err != nil {
			ctx.JSON(http.StatusBadGateway, gin.H{
				"message": err.Error(),
			})
			ctx.Abort()
			return
		}
		token, err := utils.GenerateToken(user.Username)
		if err != nil {
			ctx.JSON(501, gin.H{
				"messaje": err.Error(),
			})
			ctx.Abort()
			return
		}
		ctx.SetSameSite(http.SameSiteLaxMode)
		ctx.SetCookie("token", token, 3600, "/", "", false, true)
		ctx.JSON(200, gin.H{
			"message": user,
			"token":   token,
		})
	}
}

func (hd *HandlerContact) HandlerAddContact() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		username, exist := ctx.Get("username")
		number, exist2 := ctx.Get("number")
		if !exist || !exist2 {
			ctx.JSON(http.StatusBadGateway, gin.H{
				"message": "error al obtener datos",
			})
			ctx.Abort()
			return
		}

		contact, err := hd.service.AddContact(username.(string), number.(string), ctx)
		if err != nil {
			ctx.JSON(http.StatusBadGateway, gin.H{
				"message": err.Error(),
			})
			ctx.Abort()
			return
		}
		ctx.JSON(201, gin.H{
			"contacto creado": contact,
		})
	}
}

func (hd *HandlerContact) HandlerContacts() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		username, exist := ctx.Get("username")
		if !exist {
			ctx.JSON(http.StatusBadGateway, gin.H{
				"error": "error al obtener datos",
			})
			ctx.Abort()
			return
		}

		contacts, err := hd.service.ServiceGetContacts(username.(string), ctx)
		if err != nil {
			ctx.JSON(http.StatusBadGateway, gin.H{
				"error": "error al obtener chats",
			})
			ctx.Abort()
			return
		}

		ctx.IndentedJSON(200, contacts)
	}
}

func (hd *HandlerContact) ContactPut() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		username, exist := ctx.Get("username")
		contactadd, existContact := ctx.Get("answerContact")
		if !(exist && existContact) {
			ctx.JSON(http.StatusBadGateway, gin.H{
				"error": "error al obtener datos",
			})
			return
		}
		contact := models.ContactPut{
			ContactAdd: contactadd.(models.ContactAdd),
			Username:   username.(string),
		}

		err := hd.service.ServiceContactPut(contact, ctx)
		if err != nil {
			ctx.JSON(http.StatusBadGateway, gin.H{
				"error": "error al cambiar status",
			})
			return
		}
		ctx.JSON(http.StatusOK, gin.H{
			"message": "status actualizado",
		})
	}
}
