package handlers

import (
	"gorm/backend/models"
	"gorm/backend/services"
	"gorm/backend/utils"
	"gorm/backend/websocket"
	"log"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
)

// isSecureCookie devuelve true si la cookie debe tener flag Secure (HTTPS only)
func isSecureCookie() bool {
	return os.Getenv("ENV") == "production"
}

// setTokenCookies genera y establece las cookies de access y refresh token.
// Retorna el access token string o error.
func (s *HandlerUser) setTokenCookies(c *gin.Context, username, telephon string) (string, error) {
	// Access token (15 min)
	accessToken, err := utils.GenerateToken(username, telephon)
	if err != nil {
		return "", err
	}

	// Refresh token (7 días)
	refreshToken, err := utils.GenerateRefreshToken()
	if err != nil {
		return "", err
	}

	// Guardar refresh token en Redis (asociado al teléfono, identificador inmutable)
	ctx := c.Request.Context()
	if err := s.service.SaveRefreshToken(telephon, refreshToken, ctx); err != nil {
		log.Printf("[HANDLER] Error guardando refresh token: %v", err)
		return "", err
	}

	secure := isSecureCookie()
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie("token", accessToken, int(utils.AccessTokenDuration.Seconds()), "/", "", secure, true)
	c.SetCookie("refresh_token", refreshToken, int(utils.RefreshTokenDuration.Seconds()), "/", "", secure, true)

	return accessToken, nil
}

// clearTokenCookies elimina las cookies de access y refresh token
func clearTokenCookies(c *gin.Context) {
	secure := isSecureCookie()
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie("token", "", -1, "/", "", secure, true)
	c.SetCookie("refresh_token", "", -1, "/", "", secure, true)
}

type HandlerUser struct {
	service services.UserServicer
	hub     *websocket.Hub
}

// GetHandlerUser crea el handler de autenticación con su servicio y Hub WebSocket.
func GetHandlerUser(service services.UserServicer, hub *websocket.Hub) *HandlerUser {
	return &HandlerUser{service: service, hub: hub}
}

// HandlerLogOut maneja el registro de nuevos usuarios. Crea el usuario en BD
// (inactivo) y envía el código de activación por email. No emite tokens: la
// sesión se abre al activar la cuenta (HandlerActivateAccount).
// (El nombre es histórico; en realidad es HandlerRegister.)
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
			c.JSON(http.StatusBadRequest, gin.H{
				"error": err.Error(),
			})
			return
		}
		c.JSON(201, gin.H{
			"message": "user create",
		})
	}
}

// HandlerLogIn autentica al usuario por username+contraseña y establece las
// cookies de access token (15 min) y refresh token (7 días).
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
		// Decodificar el token para obtener datos y generar refresh
		decodedUsername, decodedTelephon, err := utils.DecodeToken(token)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "error interno del servidor",
			})
			return
		}

		_, err = s.setTokenCookies(c, decodedUsername, decodedTelephon)
		if err != nil {
			log.Printf("[HANDLER] Error generando tokens: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "error interno del servidor",
			})
			return
		}
		c.JSON(200, gin.H{
			"message": "LogIn exitoso",
		})
	}
}

// HandlerLogoutSession cierra la sesión del usuario: invalida el refresh token de
// la cookie, limpia las cookies y notifica a los contactos que el usuario se desconectó.
func (s *HandlerUser) HandlerLogoutSession() gin.HandlerFunc {
	return func(c *gin.Context) {
		telephon, existTel := c.Get("telephon")
		if existTel && telephon != nil && s.hub != nil {
			s.hub.NotifyContactsOffline(telephon.(string))
		}

		// Invalidar el refresh token de esta sesión
		if refreshToken, err := c.Cookie("refresh_token"); err == nil && refreshToken != "" {
			if err := s.service.DeleteRefreshToken(refreshToken, c.Request.Context()); err != nil {
				log.Printf("[HANDLER] Error eliminando refresh token: %v", err)
			}
		}

		clearTokenCookies(c)
		c.JSON(200, gin.H{
			"message": "logout",
		})
	}
}

// HandlerActivateAccount activa la cuenta del usuario verificando el código
// recibido por email y devuelve un JWT.
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
			c.JSON(http.StatusBadRequest, gin.H{
				"error": err.Error(),
			})
			return
		}

		// Obtener el telephon del usuario para generar el token
		telephon, exist := s.service.GetTelephonByUsername(userActivate.(models.UserActivate).Username, ctx)
		if !exist {
			c.JSON(http.StatusInternalServerError, gin.H{
				"message": "error al obtener telephon del usuario",
			})
			return
		}

		_, err = s.setTokenCookies(c, userActivate.(models.UserActivate).Username, telephon)
		if err != nil {
			log.Printf("[HANDLER] Error generando tokens en activación: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "error interno del servidor",
			})
			return
		}
		c.JSON(200, gin.H{
			"message": "cuenta activada",
		})
	}
}

// HandlerRecoverAccount solicita un código de recuperación que se envía al email
// registrado para el username indicado.
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
			c.JSON(http.StatusBadRequest, gin.H{
				"error": err.Error(),
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
			c.JSON(http.StatusBadRequest, gin.H{
				"error": err.Error(),
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
			c.JSON(http.StatusBadRequest, gin.H{
				"error": err.Error(),
			})
			return
		}
		c.JSON(200, gin.H{
			"message": "usuario recuperado",
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
			c.JSON(http.StatusBadRequest, gin.H{
				"error": err.Error(),
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
			c.JSON(http.StatusBadRequest, gin.H{
				"error": err.Error(),
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
			c.JSON(http.StatusBadRequest, gin.H{
				"error": err.Error(),
			})
			return
		}
		c.JSON(200, gin.H{
			"message": "contraseña cambiada exitosamente",
		})
	}
}

// HandlerRefreshToken renueva el access token usando el refresh token de la
// cookie. El refresh token se rota (el anterior queda invalidado) y no depende
// del access token, que puede haber expirado y desaparecido del navegador.
func (s *HandlerUser) HandlerRefreshToken() gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()

		refreshToken, err := c.Cookie("refresh_token")
		if err != nil || refreshToken == "" {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "refresh token no encontrado",
			})
			return
		}

		username, telephon, err := s.service.RefreshSession(refreshToken, ctx)
		if err != nil {
			clearTokenCookies(c)
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "refresh token invalido o expirado",
			})
			return
		}

		if _, err := s.setTokenCookies(c, username, telephon); err != nil {
			log.Printf("[HANDLER] Error renovando tokens: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "error interno del servidor",
			})
			return
		}

		c.JSON(200, gin.H{
			"message": "token renovado",
		})
	}
}
