package log

import (
	"gorm/handlers"
	"gorm/middleware"

	"github.com/gin-gonic/gin"
)

type Log struct {
	Router *gin.Engine
	Handler handlers.HandlerUser
}

func (rout *Log) Logs(){
	rout.Router.POST("/LogIn", middleware.MiddlewareLogIn(), rout.Handler.HandlerLogIn())
	rout.Router.POST("/LogOut", middleware.MiddlewareLogOut(), rout.Handler.HandlerLogOut())
}