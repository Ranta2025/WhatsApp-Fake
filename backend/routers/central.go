package routers

import (
	"gorm/backend/handlers"
	"gorm/backend/routers/api"
	"gorm/backend/routers/log"

	"github.com/gin-gonic/gin"
)

func Router(handlerLog handlers.HandlerUser, app *gin.Engine, handlerApi handlers.HandlerContact) {
	router := log.Log{Router: app,Handler: handlerLog,}
	router.Logs()
	subrouter := app.Group("/api/v1/")
	apiMessage := api.InitRouterApiMessage(subrouter, &handlerApi)
	apiMessage.ApiUser()
	apiMessage.ApiContact()
}