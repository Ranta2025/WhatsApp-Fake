package handlers

import (
	"gorm/services"
	"gorm/utils"
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

func (hd *HandlerApiMessage) HandlerPutUser() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		username, exist := ctx.Get("username")
		usernameUpedate, exist2 := ctx.Get("usernameUpdate")
		if !exist || !exist2  {
			ctx.JSON(http.StatusBadGateway, gin.H{
				"message":"error al obtener datos",
			})
			ctx.Abort()
			return 
		}
		user, err := hd.service.ServicePutUser(username.(string), usernameUpedate.(string), ctx)
		if err != nil{
			ctx.JSON(http.StatusBadGateway, gin.H{
				"message":err.Error(),
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
		ctx.SetCookie("token", token, 3600, "api/v1/","localhost",false,true)
		ctx.JSON(200, gin.H{
			"message":user,
		})
	}
}