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

func isSecureCookie() bool {
	return os.Getenv("ENV") == "production"
}

func (s *HandlerUser) setTokenCookies(c *gin.Context, username, telephon string) (string, error) {
	accessToken, err := utils.GenerateToken(username, telephon)
	if err != nil {
		return "", err
	}

	refreshToken, err := utils.GenerateRefreshToken()
	if err != nil {
		return "", err
	}

	ctx := c.Request.Context()
	if err := s.service.SaveRefreshToken(username, refreshToken, ctx); err != nil {
		log.Printf("[HANDLER] Error guardando refresh token: %v", err)
		return "", err
	}

	setTokenCookiePair(c, accessToken, refreshToken)

	return accessToken, nil
}

// setTokenCookiePair escribe las cookies de acceso y refresh con HttpOnly y Secure.
func setTokenCookiePair(c *gin.Context, accessToken, refreshToken string) {
	secure := isSecureCookie()
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie("token", accessToken, int(utils.AccessTokenDuration.Seconds()), "/", "", secure, true)
	c.SetCookie("refresh_token", refreshToken, int(utils.RefreshTokenDuration.Seconds()), "/", "", secure, true)
}

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

func GetHandlerUser(service services.UserServicer, hub *websocket.Hub) *HandlerUser {
	return &HandlerUser{service: service, hub: hub}
}

func (s *HandlerUser) HandlerRegister() gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()
		user, exist := c.Get("logout")
		if !exist {
			respondErrorMsg(c, http.StatusBadRequest, "error al obtener user")
			return
		}
		err := s.service.CreateUser(user.(models.UserDataBase), ctx)
		if err != nil {
			respondError(c, http.StatusBadRequest, models.NewAppError(http.StatusBadRequest, err.Error(), err))
			return
		}

		_, err = s.setTokenCookies(c, user.(models.UserDataBase).Username, user.(models.UserDataBase).Telephon)
		if err != nil {
			log.Printf("[HANDLER] Error generando tokens en registro: %v", err)
			respondErrorMsg(c, http.StatusInternalServerError, "error interno del servidor")
			return
		}
		respondJSON(c, http.StatusCreated, gin.H{
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
			respondErrorMsg(c, http.StatusUnauthorized, "no se encuentran los datos")
			return
		}
		user := models.UserLogin{
			Username: username.(string),
			Password: password.(string),
		}
		token, err := s.service.LogIn(user, ctx)
		if err != nil {
			log.Println("[HANDLER] Error en LogIn:", err.Error())
			// LogIn puede envolver errores internos (DB/Redis vía %w): el
			// mensaje se sanea, el detalle real queda en logs.
			respondError(c, http.StatusUnauthorized, err)
			return
		}
		log.Printf("[HANDLER] Login exitoso para usuario: %s", username)

		decodedUsername, decodedTelephon, err := utils.DecodeToken(token)
		if err != nil {
			respondErrorMsg(c, http.StatusInternalServerError, "error interno del servidor")
			return
		}

		_, err = s.setTokenCookies(c, decodedUsername, decodedTelephon)
		if err != nil {
			log.Printf("[HANDLER] Error generando tokens: %v", err)
			respondErrorMsg(c, http.StatusInternalServerError, "error interno del servidor")
			return
		}
		respondJSON(c, http.StatusOK, gin.H{
			"message": "LogIn exitoso",
		})
	}
}

func (s *HandlerUser) HandlerLogoutSession() gin.HandlerFunc {
	return func(c *gin.Context) {
		username, exist := c.Get("username")
		telephon, existTel := c.Get("telephon")

		if existTel && telephon != nil && s.hub != nil {
			s.hub.NotifyContactsOffline(telephon.(string))
		}

		if exist && username != nil {
			ctx := c.Request.Context()
			_ = s.service.DeleteRefreshToken(username.(string), ctx)
		}

		clearTokenCookies(c)
		respondJSON(c, http.StatusOK, gin.H{
			"message": "logout",
		})
	}
}

func (s *HandlerUser) HandlerActivateAccount() gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()
		userActivate, exist := c.Get("usernameActivate")
		if !exist {
			respondErrorMsg(c, http.StatusBadRequest, "error al obtener el username")
			return
		}
		err := s.service.ActivateAccount(userActivate.(models.UserActivate), ctx)
		if err != nil {
			// ActivateAccount puede envolver errores internos (%w): sanea.
			respondError(c, http.StatusBadRequest, err)
			return
		}

		telephon, exist := s.service.GetTelephonByUsername(userActivate.(models.UserActivate).Username, ctx)
		if !exist {
			respondErrorMsg(c, http.StatusInternalServerError, "error al obtener telephon del usuario")
			return
		}

		_, err = s.setTokenCookies(c, userActivate.(models.UserActivate).Username, telephon)
		if err != nil {
			log.Printf("[HANDLER] Error generando tokens en activación: %v", err)
			respondErrorMsg(c, http.StatusInternalServerError, "error interno del servidor")
			return
		}
		respondJSON(c, http.StatusOK, gin.H{
			"message": "cuenta activada",
		})
	}
}

func (s *HandlerUser) HandlerRecoverAccount() gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()
		username, exist := c.Get("userRecover")
		if !exist {
			respondErrorMsg(c, http.StatusBadRequest, "error al obtener el username")
			return
		}
		username, err := s.service.RecoverAccount(username.(string), ctx)
		if err != nil {
			// RecoverAccount puede envolver errores internos de email (%w): sanea.
			respondError(c, http.StatusBadRequest, err)
			return
		}
		respondJSON(c, http.StatusOK, gin.H{
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
			respondErrorMsg(c, http.StatusBadRequest, "error al obtener el gmail")
			return
		}
		err := s.service.ResendCode(userActivate.(string), ctx)
		if err != nil {
			respondError(c, http.StatusBadRequest, models.NewAppError(http.StatusBadRequest, err.Error(), err))
			return
		}
		respondJSON(c, http.StatusOK, gin.H{
			"message": "codigo reenviado al email",
		})
	}
}

func (s *HandlerUser) HandlerRecoverCuenta() gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()
		userRecover, exist := c.Get("recoverCuenta")
		if !exist {
			respondErrorMsg(c, http.StatusBadRequest, "error al obtener el gmail")
			return
		}
		err := s.service.RecoverCuenta(userRecover.(models.UserRecover), ctx)
		if err != nil {
			respondError(c, http.StatusBadRequest, models.NewAppError(http.StatusBadRequest, err.Error(), err))
			return
		}
		respondJSON(c, http.StatusOK, gin.H{
			"message": "usuario recuperado",
		})
	}
}

func (s *HandlerUser) HandlerChangePassword() gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()
		userChange, exist := c.Get("changePassword")
		if !exist {
			respondErrorMsg(c, http.StatusBadRequest, "error al obtener el usuario")
			return
		}
		err := s.service.ChangePassword(userChange.(models.UserChangePassword), ctx)
		if err != nil {
			respondError(c, http.StatusBadRequest, models.NewAppError(http.StatusBadRequest, err.Error(), err))
			return
		}
		respondJSON(c, http.StatusOK, gin.H{
			"message": "contraseña cambiada",
		})
	}
}
func (s *HandlerUser) HandlerRecoverAndChangePassword() gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()
		userRecover, exist := c.Get("recoverAndChange")
		if !exist {
			respondErrorMsg(c, http.StatusBadRequest, "error al obtener los datos")
			return
		}
		data := userRecover.(models.UserRecoverAndChange)
		err := s.service.RecoverAndChangePassword(data.Email, data.Code, data.Password, ctx)
		if err != nil {
			respondError(c, http.StatusBadRequest, models.NewAppError(http.StatusBadRequest, err.Error(), err))
			return
		}
		respondJSON(c, http.StatusOK, gin.H{
			"message": "cuenta desbloqueada y contraseña cambiada exitosamente",
		})
	}
}

func (s *HandlerUser) HandlerSendForgotPasswordCode() gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()
		email, exist := c.Get("emailForgot")
		if !exist {
			respondErrorMsg(c, http.StatusBadRequest, "error al obtener el email")
			return
		}
		err := s.service.SendForgotPasswordCode(email.(string), ctx)
		if err != nil {
			respondError(c, http.StatusBadRequest, models.NewAppError(http.StatusBadRequest, err.Error(), err))
			return
		}
		respondJSON(c, http.StatusOK, gin.H{
			"message": "código enviado al email",
		})
	}
}

func (s *HandlerUser) HandlerForgotPasswordChange() gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()
		userForgot, exist := c.Get("forgotPassword")
		if !exist {
			respondErrorMsg(c, http.StatusBadRequest, "error al obtener los datos")
			return
		}
		data := userForgot.(models.UserForgotPassword)
		err := s.service.ForgotPasswordChange(data.Email, data.Code, data.Password, ctx)
		if err != nil {
			respondError(c, http.StatusBadRequest, models.NewAppError(http.StatusBadRequest, err.Error(), err))
			return
		}
		respondJSON(c, http.StatusOK, gin.H{
			"message": "contraseña cambiada exitosamente",
		})
	}
}

func (s *HandlerUser) HandlerRefreshToken() gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()

		oldRefreshToken, err := c.Cookie("refresh_token")
		if err != nil || oldRefreshToken == "" {
			respondErrorMsg(c, http.StatusUnauthorized, "refresh token no encontrado")
			return
		}

		accessToken, _ := c.Cookie("token")

		username, telephon, err := decodeTokenIgnoreExpiry(accessToken)
		if err != nil {
			respondErrorMsg(c, http.StatusUnauthorized, "token invalido")
			return
		}

		if err := s.service.ValidateRefreshToken(username, oldRefreshToken, ctx); err != nil {
			respondErrorMsg(c, http.StatusUnauthorized, "refresh token invalido o expirado")
			return
		}

		newAccessToken, err := utils.GenerateToken(username, telephon)
		if err != nil {
			log.Printf("[HANDLER] Error generando access token en refresh: %v", err)
			respondErrorMsg(c, http.StatusInternalServerError, "error interno del servidor")
			return
		}

		newRefreshToken, err := utils.GenerateRefreshToken()
		if err != nil {
			log.Printf("[HANDLER] Error generando refresh token en refresh: %v", err)
			respondErrorMsg(c, http.StatusInternalServerError, "error interno del servidor")
			return
		}

		// Rotación atómica: el token viejo se invalida y el nuevo se guarda en
		// la misma operación (C1). Un refresh concurrente con el mismo token
		// viejo falla aquí y el cliente debe re-autenticarse.
		if err := s.service.RotateRefreshToken(oldRefreshToken, newRefreshToken, username, ctx); err != nil {
			log.Printf("[HANDLER] Error rotando refresh token: %v", err)
			respondErrorMsg(c, http.StatusUnauthorized, "refresh token invalido o expirado")
			return
		}

		setTokenCookiePair(c, newAccessToken, newRefreshToken)

		respondJSON(c, http.StatusOK, gin.H{
			"message": "token renovado",
		})
	}
}

// decodeTokenIgnoreExpiry extrae username y telephon de un access token
// validando SIEMPRE la firma con la clave de la aplicación. El único margen
// permitido es la expiración (leeway de 5 minutos) para cubrir el refresh flow
// sin perder la validación de firma (C2: se eliminó el fallback ParseUnverified,
// que aceptaba cualquier JWT sin verificar su firma).
func decodeTokenIgnoreExpiry(tokenStr string) (string, string, error) {
	return utils.DecodeTokenWithLeeway(tokenStr)
}
