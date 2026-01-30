package handlers

import (
	"gorm/backend/models"
	"gorm/backend/services"
	"net/http"
	"github.com/gin-gonic/gin"
)

type HandlerChat struct {
	service *services.ServiceChat
}

func InitHandlerChat(service *services.ServiceChat) *HandlerChat {
	return &HandlerChat{
		service: service,
	}
}

func (hd *HandlerChat) HandlerPostChat() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		username, exist := ctx.Get("username")
		message, exist2 := ctx.Get("message")
		if !(exist && exist2) {
			ctx.JSON(http.StatusBadGateway, gin.H{
				"error":"error al obtener los datos",
			})
			ctx.Abort()
			return 
		} 
		messageExtract := models.MessageCreat{
			MessageGet: message.(models.MessageGet),
			Username: username.(string),
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
		username, exist := ctx.Get("username")
		contact, exist2 := ctx.Get("contact")
		if !(exist && exist2) {
			ctx.JSON(http.StatusBadGateway, gin.H{
				"error":"error al obtener los datos",
			})
			ctx.Abort()
			return 
		}
		message, err := hd.service.ServiceGetMessages(username.(string), contact.(string), ctx)
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
		username, exist := ctx.Get("username")
		contact, exist2 := ctx.Get("contact")
		if !(exist && exist2) {
			ctx.JSON(http.StatusBadGateway, gin.H{
				"error":"error al obtener los datos",
			})
			return 
		}

		err := hd.service.ServicePutMessageStatusDelivered(username.(string), contact.(string), ctx)
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

func (hd *HandlerChat) HandlerPutAllChat() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		username, exist := ctx.Get("username")
		if !exist {
			ctx.JSON(http.StatusBadGateway, gin.H{
				"error":"error al obtener los datos",
			})
			return 
		}

		err := hd.service.ServicePutAllMessageStatusDelivered(username.(string), ctx)
		if err != nil {
			ctx.JSON(http.StatusInternalServerError, gin.H{
				"error": err.Error(),
			})
			return
		}
		ctx.JSON(http.StatusOK, gin.H{
			"message": "Mensajes actualizados a entregado",
		})
	}
}