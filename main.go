package main

import (
	"log"

	"gorm/database"
	"gorm/handlers"
	"gorm/repos"
	"gorm/services"
	"gorm/utils"

	"github.com/gin-gonic/gin"
)

func main() {
	utils.LoadEnv()
	data, err := database.Conection()
	if err != nil {
		log.Fatal(err)
	}
	client, err := database.ConnectMongo()
	if err != nil {
		log.Fatal(err)
	}
	defer database.DisconnectMongo()

	app := gin.Default()

	app.GET("/", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"message": "Hello, World!",
		})
	})

	app.Run(":8080")
	
	
	_ = client
	repo := repos.GetRespositorieUser(data)
	service := services.InitServices(repo)
	handler := handlers.GetHandlerUser(service)
	_ = handler

}
