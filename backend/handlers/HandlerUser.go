package handlers

import (
	"errors"
	"gorm/backend/models"
	"gorm/backend/services"
	"gorm/backend/utils"
	"gorm/backend/websocket"
	"log"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
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

	// Guardar refresh token en Redis
	ctx := c.Request.Context()
	if err := s.service.SaveRefreshToken(username, refreshToken, ctx); err != nil {
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
			c.JSON(http.StatusBadRequest, gin.H{
				"error": err.Error(),
			})
			return
		}

		// Generar access + refresh token para el usuario registrado
		token, err := s.setTokenCookies(c, user.(models.UserDataBase).Username, user.(models.UserDataBase).Telephon)
		if err != nil {
			log.Printf("[HANDLER] Error generando tokens en registro: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "error interno del servidor",
			})
			return
		}
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
		log.Printf("[HANDLER] Login exitoso para usuario: %s", username)

		// Decodificar el token para obtener datos y generar refresh
		decodedUsername, decodedTelephon, err := utils.DecodeToken(token)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "error interno del servidor",
			})
			return
		}

		accessToken, err := s.setTokenCookies(c, decodedUsername, decodedTelephon)
		if err != nil {
			log.Printf("[HANDLER] Error generando tokens: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "error interno del servidor",
			})
			return
		}
		c.JSON(200, gin.H{
			"message": "LogIn exitoso",
			"token":   accessToken,
		})
	}
}

func (s *HandlerUser) HandlerLogoutSession() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Obtener el telephon antes de eliminar el token
		username, exist := c.Get("username")
		if exist && username != nil && s.hub != nil {
			telephon, existTel := c.Get("telephon")
			if existTel && telephon != nil {
				s.hub.NotifyContactsOffline(telephon.(string))
			} else {
				s.hub.NotifyContactsOffline(username.(string))
			}
		}

		// Eliminar refresh token de Redis
		if exist && username != nil {
			ctx := c.Request.Context()
			_ = s.service.DeleteRefreshToken(username.(string), ctx)
		}

		clearTokenCookies(c)
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

		token, err := s.setTokenCookies(c, userActivate.(models.UserActivate).Username, telephon)
		if err != nil {
			log.Printf("[HANDLER] Error generando tokens en activación: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "error interno del servidor",
			})
			return
		}
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
			c.JSON(http.StatusBadRequest, gin.H{
				"error": err.Error(),
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

// HandlerRefreshToken renueva el access token usando el refresh token
func (s *HandlerUser) HandlerRefreshToken() gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()

		// Obtener refresh token de la cookie
		refreshToken, err := c.Cookie("refresh_token")
		if err != nil || refreshToken == "" {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "refresh token no encontrado",
			})
			return
		}

		// Obtener el access token expirado para extraer el username
		// Intentar desde cookie, header o query
		accessToken, _ := c.Cookie("token")
		if accessToken == "" {
			authHeader := c.GetHeader("Authorization")
			if len(authHeader) > 7 && authHeader[:7] == "Bearer " {
				accessToken = authHeader[7:]
			}
		}
		if accessToken == "" {
			accessToken = c.Query("token")
		}

		// Parsear el token expirado SIN validar expiración para obtener username
		username, telephon, err := decodeTokenIgnoreExpiry(accessToken)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "token invalido",
			})
			return
		}

		// Validar refresh token en Redis
		if err := s.service.ValidateRefreshToken(username, refreshToken, ctx); err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "refresh token invalido o expirado",
			})
			return
		}

		// Generar nuevos tokens
		newAccessToken, err := s.setTokenCookies(c, username, telephon)
		if err != nil {
			log.Printf("[HANDLER] Error renovando tokens: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "error interno del servidor",
			})
			return
		}

		c.JSON(200, gin.H{
			"message": "token renovado",
			"token":   newAccessToken,
		})
	}
}

// decodeTokenIgnoreExpiry parsea un JWT ignorando la expiración (para refresh flow)
func decodeTokenIgnoreExpiry(tokenStr string) (string, string, error) {
	// Primero intentar decodificación normal (si no ha expirado)
	username, telephon, err := utils.DecodeToken(tokenStr)
	if err == nil {
		return username, telephon, nil
	}

	// Si falló (probablemente por expiración), parsear sin validar expiración
	parser := jwt.NewParser(jwt.WithoutClaimsValidation())
	token, _, err := parser.ParseUnverified(tokenStr, jwt.MapClaims{})
	if err != nil {
		return "", "", err
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return "", "", errors.New("claims invalidos")
	}

	username2, ok := claims["username"].(string)
	if !ok {
		return "", "", errors.New("username no encontrado en token")
	}
	telephon2, ok := claims["telephon"].(string)
	if !ok {
		return "", "", errors.New("telephon no encontrado en token")
	}

	return username2, telephon2, nil
}
