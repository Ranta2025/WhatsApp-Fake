package handlers

import (
	"gorm/models"
	"gorm/services"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
)

type HandlerUser struct {
	service *services.ServicesUser
}

func GetHandlerUser(service *services.ServicesUser) *HandlerUser {
	return &HandlerUser{service}
}

func (s *HandlerUser) HandlerLogOut() gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()
		user, exist := c.Get("logout")
		if !exist {
			c.JSON(400, gin.H{
				"message": "error al obtener user",
			})
			return
		}
		err := s.service.CreateUser(user.(models.UserDataBase), ctx)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{
				"message": err.Error(),
			})
			return
		}
		c.JSON(201, gin.H{
			"message": "user create",
		})
	}
}
func (s *HandlerUser) HandlerLogIn() gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()
		username, exist := c.Get("username")
		if !exist {
			c.JSON(401, gin.H{
				"error": "no se encuentran los datos",
			})
			return
		}
		password, exist := c.Get("password")
		if !exist {
			c.JSON(401, gin.H{
				"error": "no se encuentran los datos",
			})
			return
		}
		log.Println("[HANDLER] Username:", username.(string))
		log.Println("[HANDLER] Password:", password.(string))
		user := models.UserLogin{
			Username: username.(string),
			Password: password.(string),
		}
		token, err := s.service.LogIn(user, ctx)
		if err != nil {
			log.Println("[HANDLER] Error en LogIn:", err.Error())
			c.JSON(401, gin.H{
				"error": err.Error(),
			})
			return
		}
		log.Println("[HANDLER] Login exitoso, token:", token)
		c.SetCookie("token", token, 3600, "/api/v1/", "localhost", false, true)
		c.JSON(200, gin.H{
			"message": "LogIn exitoso",
		})
	}
}

func (s *HandlerUser) HandlerLogoutSession() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.SetCookie("token", "", -1, "api/v1/", "localhost", false, true)
		c.JSON(200, gin.H{
			"message": "logout",
		})
	}
}
