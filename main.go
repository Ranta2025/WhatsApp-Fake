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
	utils.InitLogger()
	utils.ValidateJWTSecret()
	db, rd, mc, err := database.GetConection()
	if err != nil {
		panic(err)
	}

	// Servicio y handler de media (MinIO)
	serviceMedia := services.InitServiceMedia(mc)
	handlerMedia := handlers.InitHandlerMedia(serviceMedia)

	app := GetApp()
	app.app.Use(config.Cors())
	app.app.Use(middleware.TimeMiddleware())

	// Obtener repositorio primero
	repo := repos.InitRepoContact(db, rd)

	// Inicializar Hub de WebSocket con repositorio para obtener contactos
	hub := websocket.NewHub(repo)
	go hub.Run()

	// Ahora inicializar handlers con el hub
	handlerContact, handlerChat, serviceChat, serviceContact := GetHandlerApi(db, rd, hub)
	handlerLog := GetHandlerLog(db, rd, hub)
	handlerBugReport := GetHandlerBugReport()

	// Inicializar servicio de llamadas con el mismo repo
	serviceCall := services.InitServiceCall(repo)
	handlerCall := handlers.InitHandlerCall(serviceCall)

	// Inicializar dominio de grupos
	repoGroup := repos.InitRepoGroup(db, rd)
	serviceGroup := services.InitServiceGroup(repoGroup, repo)
	handlerGroup := handlers.InitHandlerGroup(serviceGroup, hub)

	routers.Router(*handlerLog, app.app, *handlerContact, *handlerChat, handlerCall, hub, serviceChat, serviceContact, handlerBugReport, serviceCall, handlerMedia, handlerGroup, serviceGroup)

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

func GetHandlerApi(data *gorm.DB, rd *redis.Client, hub *websocket.Hub) (*handlers.HandlerContact, *handlers.HandlerChat, services.ChatServicer, services.ContactServicer) {
	repo := repos.InitRepoContact(data, rd)
	serviceMessage := services.InitServiceMessage(repo)
	serviceContact := services.InitServiceContact(repo)
	handlerContact := handlers.InitHandlerApiMessage(serviceContact, hub)
	handlerChat := handlers.InitHandlerChat(serviceMessage, hub)
	return handlerContact, handlerChat, serviceMessage, serviceContact
}

func GetHandlerBugReport() *handlers.HandlerBugReport {
	service := services.InitServiceBugReport()
	handler := handlers.InitHandlerBugReport(service)
	return handler
}
