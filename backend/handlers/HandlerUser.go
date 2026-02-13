package handlers

import (
	"gorm/backend/models"
	"gorm/backend/services"
	"gorm/backend/utils"
	"gorm/backend/websocket"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
)

type HandlerUser struct {
	service *services.ServicesUser
	hub     *websocket.Hub
}

func GetHandlerUser(service *services.ServicesUser, hub *websocket.Hub) *HandlerUser {
	return &HandlerUser{service: service, hub: hub}
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

		// Generar token para el usuario registrado
		token, err := utils.GenerateToken(user.(models.UserDataBase).Username)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"message": "usuario creado pero error al generar token",
			})
			return
		}

		c.SetSameSite(http.SameSiteLaxMode)
		c.SetCookie("token", token, 3600, "/", "", false, true)
		c.JSON(201, gin.H{
			"message": "user create",
			"token":   token,
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
		log.Printf("[HANDLER] Login exitoso, generando cookie y token para usuario: %s", username)
		log.Printf("[HANDLER] Token generado: %v", token)
		c.SetSameSite(http.SameSiteLaxMode)
		c.SetCookie("token", token, 3600, "/", "", false, true)
		log.Printf("[HANDLER] Cookie establecida, enviando respuesta JSON con token")
		c.JSON(200, gin.H{
			"message": "LogIn exitoso",
			"token":   token,
		})
	}
}

func (s *HandlerUser) HandlerLogoutSession() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Obtener el username antes de eliminar el token
		username, exist := c.Get("username")
		if exist && username != nil {
			// Notificar a los contactos que el usuario está offline
			if s.hub != nil {
				s.hub.NotifyContactsOffline(username.(string))
			}
		}

		c.SetSameSite(http.SameSiteLaxMode)
		c.SetCookie("token", "", -1, "/", "", false, true)
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
		token, err := utils.GenerateToken(userActivate.(models.UserActivate).Username)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"message": "error al generar token",
			})
			return
		}
		c.SetSameSite(http.SameSiteLaxMode)
		c.SetCookie("token", token, 3600, "/", "", false, true)
		c.JSON(200, gin.H{
			"message": "cuenta activada",
			"token":   token,
		})
	}
}

func (s *HandlerUser) HandlerRecoverAccount() gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()
		username, exist := c.Get("userRecover")
		if !exist {
			c.JSON(400, gin.H{
				"message": "error al obtener el username",
			})
			return
		}
		username, err := s.service.RecoverAccount(username.(string), ctx)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{
				"message": err.Error(),
			})
			return
		}
		c.JSON(200, gin.H{
			"message":  "codigo reenviado al email",
			"username": username,
		})
	}
}

func (s *HandlerUser) HandlerResendCode() gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()
		userActivate, exist := c.Get("gmailResend")
		if !exist {
			c.JSON(400, gin.H{
				"message": "error al obtener el gmail",
			})
			return
		}
		err := s.service.ResendCode(userActivate.(string), ctx)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{
				"message": err.Error(),
			})
			return
		}
		c.JSON(200, gin.H{
			"message": "codigo reenviado al email",
		})
	}
}

func (s *HandlerUser) HandlerRecoverCuenta() gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()
		userRecover, exist := c.Get("recoverCuenta")
		if !exist {
			c.JSON(400, gin.H{
				"message": "error al obtener el gmail",
			})
			return
		}
		err := s.service.RecoverCuenta(userRecover.(models.UserRecover), ctx)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{
				"message": err.Error(),
			})
			return
		}
		c.JSON(200, gin.H{
			"message": "usuario recuperado",
		})
	}
}

func (s *HandlerUser) HandlerChangePassword() gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()
		userChange, exist := c.Get("changePassword")
		if !exist {
			c.JSON(400, gin.H{
				"message": "error al obtener el usuario",
			})
			return
		}
		err := s.service.ChangePassword(userChange.(models.UserChangePassword), ctx)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{
				"message": err.Error(),
			})
			return
		}
		c.JSON(200, gin.H{
			"message": "contraseña cambiada",
		})
	}
}
func (s *HandlerUser) HandlerRecoverAndChangePassword() gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()
		userRecover, exist := c.Get("recoverAndChange")
		if !exist {
			c.JSON(400, gin.H{
				"message": "error al obtener los datos",
			})
			return
		}
		data := userRecover.(models.UserRecoverAndChange)
		err := s.service.RecoverAndChangePassword(data.Email, data.Code, data.Password, ctx)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{
				"message": err.Error(),
			})
			return
		}
		c.JSON(200, gin.H{
			"message": "cuenta desbloqueada y contraseña cambiada exitosamente",
		})
	}
}

func (s *HandlerUser) HandlerSendForgotPasswordCode() gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()
		email, exist := c.Get("emailForgot")
		if !exist {
			c.JSON(400, gin.H{
				"message": "error al obtener el email",
			})
			return
		}
		err := s.service.SendForgotPasswordCode(email.(string), ctx)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{
				"message": err.Error(),
			})
			return
		}
		c.JSON(200, gin.H{
			"message": "código enviado al email",
		})
	}
}

func (s *HandlerUser) HandlerForgotPasswordChange() gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()
		userForgot, exist := c.Get("forgotPassword")
		if !exist {
			c.JSON(400, gin.H{
				"message": "error al obtener los datos",
			})
			return
		}
		data := userForgot.(models.UserForgotPassword)
		err := s.service.ForgotPasswordChange(data.Email, data.Code, data.Password, ctx)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{
				"message": err.Error(),
			})
			return
		}
		c.JSON(200, gin.H{
			"message": "contraseña cambiada exitosamente",
		})
	}
}
