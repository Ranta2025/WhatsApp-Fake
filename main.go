package main

import (
	"log"

	"gorm/config"
	"gorm/database"
	"gorm/handlers"
	"gorm/middleware"
	"gorm/repos"
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
	_ = rd
	_ = client
	repo := repos.GetRespositorieUser(data)
	service := services.InitServices(repo)
	handler := handlers.GetHandlerUser(service)
	_ = handler
	app := GetApp()
	app.app.Use(config.Cors())
	app.app.Use(middleware.TimeMiddleware())
	app.Welcome()
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