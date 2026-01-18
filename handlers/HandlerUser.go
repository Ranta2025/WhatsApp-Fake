package handlers

import (
	"gorm/models"
	"gorm/services"
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
				"message": err,
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
		user, exist := c.Get("login")
		if !exist {
			c.JSON(401, gin.H{
				"error": "no se encuentran los datos",
			})
			return
		}
		token, err := s.service.LogIn(user.(models.UserLogin), ctx)
		if err != nil {
			c.JSON(401, gin.H{
				"error": err,
			})
			return
		}
		c.JSON(200, gin.H{
			"message": "login exitoso",
		})
		c.SetCookie(token, "token", 3600, "/", "localhost", false, true)
	}
}
