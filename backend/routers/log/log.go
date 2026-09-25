package log

import (
	"gorm/backend/handlers"
	"gorm/backend/middleware"
	"time"

	"github.com/gin-gonic/gin"
)

type Log struct {
	Router  *gin.Engine
	Handler handlers.HandlerUser
}

// Logs registra todas las rutas de autenticación: registro, login, logout,
// activación de cuenta, recuperación y cambio de contraseña.
// Los endpoints sensibles tienen límite de peticiones por IP: los que envían
// emails (evita spam) y los de login/códigos (dificulta la fuerza bruta).
func (rout *Log) Logs() {
	authLimit := middleware.NewRateLimiter(20, time.Minute).Middleware()
	emailLimit := middleware.NewRateLimiter(5, 10*time.Minute).Middleware()

	rout.Router.POST("/LogIn", authLimit, middleware.MiddlewareLogIn(), rout.Handler.HandlerLogIn())
	rout.Router.POST("/register", emailLimit, middleware.MiddlewareLogOut(), rout.Handler.HandlerLogOut())
	rout.Router.POST("/logout", middleware.MiddlewareTokenWithTelephon(), rout.Handler.HandlerLogoutSession())
	rout.Router.POST("/refresh", authLimit, rout.Handler.HandlerRefreshToken())
	rout.Router.POST("/activate", authLimit, middleware.MiddlewareActivateAccount(), rout.Handler.HandlerActivateAccount())
	rout.Router.POST("/activate-cuenta", emailLimit, middleware.MiddlewareRecoverAccount(), rout.Handler.HandlerRecoverAccount())
	rout.Router.POST("/resend-code", emailLimit, middleware.MiddlewareResendCode(), rout.Handler.HandlerResendCode())
	rout.Router.POST("/recover-cuenta", authLimit, middleware.MiddlewareRecoverCuenta(), rout.Handler.HandlerRecoverCuenta())
	rout.Router.POST("/unlock-account", authLimit, middleware.MiddlewareRecoverAndChangePassword(), rout.Handler.HandlerRecoverAndChangePassword())
	rout.Router.POST("/forgot-password-send", emailLimit, middleware.MiddlewareSendForgotPasswordCode(), rout.Handler.HandlerSendForgotPasswordCode())
	rout.Router.POST("/forgot-password-change", authLimit, middleware.MiddlewareForgotPasswordChange(), rout.Handler.HandlerForgotPasswordChange())
}
