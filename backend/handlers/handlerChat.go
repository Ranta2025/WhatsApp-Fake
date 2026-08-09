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
	service services.ChatServicer
	hub     *websocket.Hub
}

func InitHandlerChat(service services.ChatServicer, hub *websocket.Hub) *HandlerChat {
	return &HandlerChat{service: service, hub: hub}
}

func (hd *HandlerChat) HandlerPostChat() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exist := ctx.Get("telephon")
		msgData, exist2 := ctx.Get("message")
		if !(exist && exist2) {
			respondErrorMsg(ctx, http.StatusBadRequest, "error al obtener los datos")
			return
		}
		messageExtract := models.MessageCreat{
			MessageGet: msgData.(models.MessageGet),
			Telephon:   telephon.(string),
		}

		createdMsg, err := hd.service.ServiceCreatMessage(messageExtract, ctx)
		if err != nil {
			respondError(ctx, http.StatusInternalServerError, err)
			return
		}
		ctx.JSON(http.StatusOK, gin.H{
			"message": createdMsg,
		})
	}
}

func (hd *HandlerChat) HandlerGetChats() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exist := ctx.Get("telephon")
		contact, exist2 := ctx.Get("contact")
		if !(exist && exist2) {
			respondErrorMsg(ctx, http.StatusBadRequest, "error al obtener los datos")
			return
		}
		message, err := hd.service.ServiceGetMessages(telephon.(string), contact.(string), ctx)
		if err != nil {
			respondError(ctx, http.StatusInternalServerError, err)
			return
		}
		ctx.IndentedJSON(http.StatusOK, message)
	}
}

func (hd *HandlerChat) HandlerPutChat() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exist := ctx.Get("telephon")
		contact, exist2 := ctx.Get("contact")
		if !(exist && exist2) {
			respondErrorMsg(ctx, http.StatusBadRequest, "error al obtener los datos")
			return
		}

		err := hd.service.ServicePutMessageStatusDelivered(telephon.(string), contact.(string), ctx)
		if err != nil {
			respondError(ctx, http.StatusInternalServerError, err)
			return
		}

		ctx.JSON(http.StatusOK, gin.H{
			"message": "Mensajes actualizado a visto",
		})
	}
}

func (hd *HandlerChat) HandlerGetAllChats() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exist := ctx.Get("telephon")
		if !exist {
			respondErrorMsg(ctx, http.StatusBadRequest, "error al obtener los datos")
			return
		}
		chats, err := hd.service.ServiceGetAllChats(telephon.(string), ctx)
		if err != nil {
			respondError(ctx, http.StatusInternalServerError, err)
			return
		}
		ctx.IndentedJSON(http.StatusOK, chats)
	}
}

func (hd *HandlerChat) HandlerPutAllChat() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exist := ctx.Get("telephon")
		if !exist {
			respondErrorMsg(ctx, http.StatusBadRequest, "error al obtener los datos")
			return
		}

		senders, err := hd.service.ServiceGetSendersAndMarkDelivered(telephon.(string), ctx)
		if err != nil {
			respondError(ctx, http.StatusInternalServerError, err)
			return
		}

		if hd.hub != nil && len(senders) > 0 {
			msg, err := json.Marshal(map[string]interface{}{
				"type": "message_delivered",
				"payload": map[string]interface{}{
					"receiver": telephon.(string),
				},
			})
			if err != nil {
				respondErrorMsg(ctx, http.StatusInternalServerError, "error interno al notificar entrega")
				return
			}
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
			respondErrorMsg(ctx, http.StatusBadRequest, "error al obtener los datos")
			return
		}

		msgEdit := msgEditInterface.(models.MessageEdit)

		updatedMsg, err := hd.service.ServiceEditMessage(telephon.(string), msgEdit.MessageID, msgEdit.Message, ctx)
		if err != nil {
			respondError(ctx, http.StatusInternalServerError, err)
			return
		}

		ctx.JSON(http.StatusOK, gin.H{"data": updatedMsg})
	}
}

func (hd *HandlerChat) HandlerClearChat() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephonUser, exist := ctx.Get("telephon")
		telephonContact, exist2 := ctx.Get("contact")
		if !exist || !exist2 {
			respondErrorMsg(ctx, http.StatusBadRequest, "error al obtener los datos")
			return
		}

		if err := hd.service.ServiceClearChat(telephonUser.(string), telephonContact.(string), ctx); err != nil {
			respondError(ctx, http.StatusInternalServerError, err)
			return
		}

		ctx.JSON(http.StatusOK, gin.H{"message": "Chat vaciado correctamente"})
	}
}

func (hd *HandlerChat) HandlerDeleteMessageForMe() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephonUser, exist := ctx.Get("telephon")
		messageID, exist2 := ctx.Get("messageID")
		if !exist || !exist2 {
			respondErrorMsg(ctx, http.StatusBadRequest, "error al obtener los datos")
			return
		}

		deletedMsg, err := hd.service.ServiceDeleteMessageForMe(telephonUser.(string), messageID.(uint), ctx)
		if err != nil {
			respondError(ctx, http.StatusInternalServerError, err)
			return
		}

		ctx.JSON(http.StatusOK, deletedMsg)
	}
}
