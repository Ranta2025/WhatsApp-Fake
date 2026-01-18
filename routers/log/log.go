package log

import (
	"gorm/handlers"

	"github.com/gin-gonic/gin"
)

type Log struct {
	router gin.RouterGroup
	handler handlers.HandlerUser
}

func (rout *Log) LogIn(){
	rout.router.POST("/LogIn", rout.handler.HandlerLogIn())
	rout.router.POST("/LogOut",rout.handler.HandlerLogOut())
}