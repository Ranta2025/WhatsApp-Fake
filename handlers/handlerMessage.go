package handlers

import (
	"gorm/services"
	"net/http"

	"github.com/gin-gonic/gin"
)

type HandlerApiMessage struct {
	service *services.ServiceApiMessage
}

func InitHandlerApiMessage(services *services.ServiceApiMessage) *HandlerApiMessage {
	return &HandlerApiMessage{
		service: services,
	}
}


func (hd *HandlerApiMessage) HandlerGetUser() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		username, exist := ctx.Get("username")
		if !exist {
			ctx.JSON(http.StatusBadGateway, gin.H{
				"error":"error al obtener datos",
			})
			ctx.Abort()
			return 
		}
		user, err := hd.service.ServicesGetUser(username.(string), ctx)
		if err != nil {
			ctx.JSON(http.StatusNotImplemented, gin.H{
				"message":err.Error(),
			})
			ctx.Abort()
			return 
		}
		ctx.IndentedJSON(200,user)
	}
}