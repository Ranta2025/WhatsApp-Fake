package handlers

import (
	"encoding/json"
	"gorm/backend/models"
	"gorm/backend/services"
	"gorm/backend/utils"
	"gorm/backend/websocket"
	"net/http"

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

		// Enviar notificación WebSocket al receptor de la solicitud
		if hd.hub != nil {
			// Obtener información del usuario que envía la solicitud
			sender, errSender := hd.service.ServicesGetUser(username.(string), ctx)
			if errSender == nil {
				// Notificar al receptor (contact.Username) que recibió una solicitud
				hd.hub.NotifyContactRequest(contact.Username, sender.Username, sender.Telephon)
			}
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

		// Enviar notificaciones WebSocket
		if hd.hub != nil {
			// Obtener información del usuario que responde (el que acepta/rechaza)
			responder, errResponder := hd.service.ServicesGetUser(username.(string), ctx)
			if errResponder == nil {
				// Determinar si fue aceptado o rechazado
				accepted := contact.Answer == "yes" || contact.Answer == "Yes" || contact.Answer == "YES"

				// 1. Notificar al usuario que envió la solicitud original (contact.UsernameAdd)
				hd.hub.NotifyContactResponse(contact.UsernameAdd, responder.Username, responder.Telephon, accepted)

				// 2. Confirmar al usuario que acepta/rechaza (username)
				client, exists := hd.hub.GetClient(username.(string))

				if exists {
					var confirmMsg []byte
					if accepted {
						confirmMsg, _ = json.Marshal(map[string]interface{}{
							"type": "contact_accepted",
							"payload": map[string]interface{}{
								"username": contact.UsernameAdd,
								"status":   "accepted",
							},
						})
					} else {
						confirmMsg, _ = json.Marshal(map[string]interface{}{
							"type": "contact_rejected",
							"payload": map[string]interface{}{
								"username": contact.UsernameAdd,
								"status":   "rejected",
							},
						})
					}
					select {
					case client.Send <- confirmMsg:
					default:
					}
				}
			}
		}

		ctx.JSON(http.StatusOK, gin.H{
			"message": "status actualizado",
		})
	}
}
