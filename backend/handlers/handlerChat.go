package handlers

import (
	"encoding/json"
	"gorm/backend/models"
	"gorm/backend/services"
	"gorm/backend/websocket"
	"net/http"

	"github.com/gin-gonic/gin"
)

type HandlerChat struct {
	service *services.ServiceChat
	hub     *websocket.Hub
}

func InitHandlerChat(service *services.ServiceChat, hub *websocket.Hub) *HandlerChat {
	return &HandlerChat{service: service, hub: hub}
}

func (hd *HandlerChat) HandlerPostChat() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exist := ctx.Get("telephon")
		message, exist2 := ctx.Get("message")
		if !(exist && exist2) {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"error": "error al obtener los datos",
			})
			ctx.Abort()
			return
		}
		messageExtract := models.MessageCreat{
			MessageGet: message.(models.MessageGet),
			Telephon:   telephon.(string),
		}

		message, err := hd.service.ServiceCreatMessage(messageExtract, ctx)
		if err != nil {
			ctx.JSON(http.StatusInternalServerError, gin.H{
				"error": err.Error(),
			})
			ctx.Abort()
			return
		}
		ctx.JSON(http.StatusOK, gin.H{
			"message": message,
		})
	}
}

func (hd *HandlerChat) HandlerGetChats() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		// Usar telephon del token (identificador inmutable)
		telephon, exist := ctx.Get("telephon")
		contact, exist2 := ctx.Get("contact")
		if !(exist && exist2) {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"error": "error al obtener los datos",
			})
			ctx.Abort()
			return
		}
		message, err := hd.service.ServiceGetMessages(telephon.(string), contact.(string), ctx)
		if err != nil {
			ctx.JSON(http.StatusInternalServerError, gin.H{
				"error": err.Error(),
			})
			ctx.Abort()
			return
		}
		ctx.IndentedJSON(http.StatusOK, message)
	}
}

func (hd *HandlerChat) HandlerPutChat() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		// Usar telephon del token (identificador inmutable)
		telephon, exist := ctx.Get("telephon")
		contact, exist2 := ctx.Get("contact")
		if !(exist && exist2) {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"error": "error al obtener los datos",
			})
			return
		}

		err := hd.service.ServicePutMessageStatusDelivered(telephon.(string), contact.(string), ctx)
		if err != nil {
			ctx.JSON(http.StatusInternalServerError, gin.H{
				"error": err.Error(),
			})
			return
		}

		ctx.JSON(http.StatusOK, gin.H{
			"message": "Mensajes actualizado a visto",
		})
	}
}

// HandlerGetAllChats devuelve todos los chats del usuario agrupados por contacto.
// Si IsContact=false el front debe mostrar opciones para agregar o bloquear al remitente.
func (hd *HandlerChat) HandlerGetAllChats() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exist := ctx.Get("telephon")
		if !exist {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"error": "error al obtener los datos",
			})
			ctx.Abort()
			return
		}
		chats, err := hd.service.ServiceGetAllChats(telephon.(string), ctx)
		if err != nil {
			ctx.JSON(http.StatusInternalServerError, gin.H{
				"error": err.Error(),
			})
			ctx.Abort()
			return
		}
		ctx.IndentedJSON(http.StatusOK, chats)
	}
}

func (hd *HandlerChat) HandlerPutAllChat() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exist := ctx.Get("telephon")
		if !exist {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"error": "error al obtener los datos",
			})
			return
		}

		// Obtener remitentes con mensajes pendientes ANTES de actualizar
		senders, err := hd.service.ServiceGetSendersAndMarkDelivered(telephon.(string), ctx)
		if err != nil {
			ctx.JSON(http.StatusInternalServerError, gin.H{
				"error": err.Error(),
			})
			return
		}

		// Notificar por WS a cada remitente que sus mensajes fueron entregados
		if hd.hub != nil && len(senders) > 0 {
			msg, _ := json.Marshal(map[string]interface{}{
				"type": "message_delivered",
				"payload": map[string]interface{}{
					"receiver": telephon.(string),
				},
			})
			for _, senderTel := range senders {
				hd.hub.SendTo(senderTel, msg)
			}
		}

		ctx.JSON(http.StatusOK, gin.H{
			"message": "Mensajes actualizados a entregado",
		})
	}
}

func (hd *HandlerChat) HandlerEditMessage() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exist := ctx.Get("telephon")
		msgEditInterface, exist2 := ctx.Get("messageEdit")

		if !(exist && exist2) {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"error": "error al obtener los datos",
			})
			return
		}

		msgEdit := msgEditInterface.(models.MessageEdit)

		updatedMsg, err := hd.service.ServiceEditMessage(telephon.(string), msgEdit.MessageID, msgEdit.Message, ctx)
		if err != nil {
			ctx.JSON(http.StatusInternalServerError, gin.H{
				"error": err.Error(),
			})
			return
		}

		ctx.JSON(http.StatusOK, updatedMsg)
	}
}
