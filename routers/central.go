package routers

import (
	"gorm/handlers"
	"gorm/routers/log"

	"github.com/gin-gonic/gin"
)

func Router(handler handlers.HandlerUser, app *gin.Engine) {
	router := log.Log{
		Router: app,
		Handler: handler,
	}
	router.Logs()
}