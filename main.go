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
	"gorm/backend/websocket"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

func main() {
	utils.LoadEnv()
	db, rd, err := database.GetConection()
	if err != nil {
		panic(err)
	}

	app := GetApp()
	app.app.Use(config.Cors())
	app.app.Use(middleware.TimeMiddleware())

	handlerContact, handlerChat, serviceChat, repo := GetHandlerApi(db)

	// Inicializar Hub de WebSocket con repositorio para obtener contactos
	hub := websocket.NewHub(repo)
	go hub.Run()

	handlerLog := GetHandlerLog(db, rd, hub)

	routers.Router(*handlerLog, app.app, *handlerContact, *handlerChat, hub, serviceChat)

	app.Welcome()
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

func GetHandlerLog(data *gorm.DB, rd *redis.Client, hub *websocket.Hub) *handlers.HandlerUser {
	repo := repos.GetRespositorieUser(data)
	cache := cache.InitChacheUser(rd, repo)
	service := services.InitServices(repo, cache)
	handler := handlers.GetHandlerUser(service, hub)
	return handler
}

func GetHandlerApi(data *gorm.DB) (*handlers.HandlerContact, *handlers.HandlerChat, *services.ServiceChat, *repos.ApiContact) {
	repo := repos.InitRepoContact(data)
	serviceMessage := services.InitServiceMessage(repo)
	serviceContact := services.InitServiceContact(repo)
	handlerContact := handlers.InitHandlerApiMessage(serviceContact)
	handlerChat := handlers.InitHandlerChat(serviceMessage)
	return handlerContact, handlerChat, serviceMessage, repo
}
