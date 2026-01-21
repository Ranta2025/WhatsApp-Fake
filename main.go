package main

import (
	"log"

	"gorm/cache"
	"gorm/config"
	"gorm/database"
	"gorm/handlers"
	"gorm/middleware"
	"gorm/repos"
	"gorm/routers"
	"gorm/services"
	"gorm/utils"

	"github.com/gin-gonic/gin"
)

func main() {
	utils.LoadEnv()
	defer database.DisconnectMongo()
	data, client,rd, err := database.GetConection()
	if err != nil {
		log.Fatal(err)
	}
	_ = client
	repo := repos.GetRespositorieUser(data)
	cache := cache.InitChacheUser(rd, repo)
	service := services.InitServices(repo, cache)
	handler := handlers.GetHandlerUser(service)
	app := GetApp()
	app.app.Use(config.Cors())
	app.app.Use(middleware.TimeMiddleware())
	app.Welcome()
	routers.Router(*handler, app.app)
	app.Run()
}

type app struct{
	app *gin.Engine
}

func (a *app) Run(){
	a.app.Run(":8080")
}

func (a *app) Welcome(){
	a.app.GET("/", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"message": "Welcome",
		})
	})
}

func GetApp() app{
	app := app{app: gin.Default()}
	return app
}