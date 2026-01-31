package main

import (
	"gorm/backend/cache"
	"gorm/backend/config"
	"gorm/backend/database"
	"gorm/backend/handlers"
	"gorm/backend/middleware"
	"gorm/backend/repos"
	"gorm/backend/routers"
	"gorm/backend/services"
	"gorm/backend/utils"
	"log"
	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

func main() {
	utils.LoadEnv()
	data, rd, err := database.GetConection()
	if err != nil {
		log.Fatal(err)
	}
	data.Exec("DELETE FROM user_data_bases, contact_data_bases")
	handlerLog := GetHandlerLog(data, rd)
	handlerContact, handlerChat := GetHandlerApi(data)
	app := GetApp()
	app.app.Use(config.Cors())
	app.app.Use(middleware.TimeMiddleware())
	app.Welcome()
	routers.Router(*handlerLog, app.app, *handlerContact, *handlerChat)
	app.Run()
    
}

type app struct {
	app *gin.Engine
}

func (a *app) Run() {
	a.app.Run(":8080")
}

func (a *app) Welcome() {
	a.app.GET("/", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"message": "Welcome",
		})
	})
}

func GetApp() app {
	app := app{app: gin.Default()}
	return app
}

func GetHandlerLog(data *gorm.DB, rd *redis.Client) *handlers.HandlerUser {
	repo := repos.GetRespositorieUser(data)
	cache := cache.InitChacheUser(rd, repo)
	service := services.InitServices(repo, cache)
	handler := handlers.GetHandlerUser(service)
	return handler
}

func GetHandlerApi(data *gorm.DB) (*handlers.HandlerContact, *handlers.HandlerChat) {
	repo := repos.InitRepoContact(data)
	serviceMessage := services.InitServiceMessage(repo)
	serviceContact := services.InitServiceContact(repo)
	handlerContact := handlers.InitHandlerApiMessage(serviceContact)
	handlerChat := handlers.InitHandlerChat(serviceMessage)
	return handlerContact, handlerChat
}
