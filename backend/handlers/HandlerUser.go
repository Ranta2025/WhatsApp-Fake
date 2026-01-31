package handlers

import (
	"gorm/backend/models"
	"gorm/backend/services"
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
		password, exist2 := c.Get("password")
		if !(exist && exist2) {
			c.JSON(401, gin.H{
				"error": "no se encuentran los datos",
			})
			return
		}
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

func (s *HandlerUser) HandlerActivateAccount() gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()
		userActivate, exist := c.Get("usernameActivate")
		if !exist {
			c.JSON(400, gin.H{
				"message": "error al obtener el username",
			})
			return
		}
		err := s.service.ActivateAccount(userActivate.(models.UserActivate), ctx)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{
				"message": err.Error(),
			})
			return
		}
		c.JSON(200, gin.H{
			"message": "cuenta activada",
		})
	}
}

func (s *HandlerUser) HandlerRecoverAccount() gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()
		email, exist := c.Get("emailRecover")
		if !exist {
			c.JSON(400, gin.H{
				"message": "error al obtener el email",
			})
			return
		}
		username, err := s.service.RecoverAccount(email.(string), ctx)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{
				"message": err.Error(),
			})
			return
		}
		c.JSON(200, gin.H{
			"message":  "codigo enviado al email",
			"username": username,
		})
	}
}

