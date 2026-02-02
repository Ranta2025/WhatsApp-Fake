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
	handlerLog := GetHandlerLog(data, rd)

	// Crear servicios y handlers con inyección de dependencias
	handlerContact, handlerChat, wsService := GetHandlerApiWithWS(data)
	handlerWS := handlers.InitHandlerWebSocket(wsService)

	app := GetApp()
	app.app.Use(config.Cors())
	app.app.Use(middleware.TimeMiddleware())
	app.Welcome()
	routers.Router(*handlerLog, app.app, *handlerContact, *handlerChat, handlerWS)
	app.Run()
}

type app struct {
	app *gin.Engine
}

func (a *app) Run() {
	a.app.Run("0.0.0.0:8080") // Escuchar en todas las interfaces (0.0.0.0) para acceso desde red
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

func GetHandlerApiWithWS(data *gorm.DB) (*handlers.HandlerContact, *handlers.HandlerChat, *services.ServiceWebSocket) {
	repo := repos.InitRepoContact(data)
	serviceMessage := services.InitServiceMessage(repo)
	serviceContact := services.InitServiceContact(repo)

	// Crear WebSocket service
	wsService := services.InitServiceWebSocket(repo, serviceMessage)

	handlerContact := handlers.InitHandlerApiMessage(serviceContact)
	handlerChat := handlers.InitHandlerChat(serviceMessage)
	return handlerContact, handlerChat, wsService
}

func GetHandlerWebSocket(data *gorm.DB, handlerChat *handlers.HandlerChat) *handlers.HandlerWebSocket {
	repo := repos.InitRepoContact(data)
	chatService := services.InitServiceMessage(repo)
	wsService := services.InitServiceWebSocket(repo, chatService)
	handlerWS := handlers.InitHandlerWebSocket(wsService)
	return handlerWS
}
