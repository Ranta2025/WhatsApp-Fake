package log

import (
	"gorm/backend/handlers"
	"gorm/backend/middleware"

	"github.com/gin-gonic/gin"
)

type Log struct {
	Router *gin.Engine
	Handler handlers.HandlerUser
}

func (rout *Log) Logs(){
	rout.Router.POST("/LogIn", middleware.MiddlewareLogIn(), rout.Handler.HandlerLogIn())
	rout.Router.POST("/register", middleware.MiddlewareLogOut(), rout.Handler.HandlerLogOut())
	rout.Router.POST("/logout", rout.Handler.HandlerLogoutSession())
}
