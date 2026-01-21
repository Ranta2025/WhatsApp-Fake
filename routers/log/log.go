package log

import (
	"gorm/handlers"
	"gorm/middleware"

	"github.com/gin-gonic/gin"
)

type Log struct {
	router gin.RouterGroup
	handler handlers.HandlerUser
}

func (rout *Log) LogIn(){
	rout.router.POST("/LogIn", middleware.MiddlewareLogIn(), rout.handler.HandlerLogIn())
	rout.router.POST("/LogOut", middleware.MiddlewareLogOut(), rout.handler.HandlerLogOut())
}