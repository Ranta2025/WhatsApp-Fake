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
//
// Rate limits (IP-based — todos los endpoints son públicos):
//
//	/LogIn                 5  req / min  — brute-force de credenciales
//	/register              5  req / min  — spam de cuentas
//	/logout               20  req / min  — acción legítima frecuente
//	/refresh              30  req / min  — el cliente lo llama automáticamente
//	/activate             10  req / min  — código de un solo uso
//	/activate-cuenta      10  req / min
//	/resend-code           3  req / min  — evitar flood de emails/SMS
//	/recover-cuenta       10  req / min
//	/unlock-account        5  req / min
//	/forgot-password-send  3  req / min  — evitar flood de emails
//	/forgot-password-change 5 req / min
func (rout *Log) Logs() {
	// ── Brute-force sensitive ────────────────────────────────────────────────
	rout.Router.POST("/LogIn",
		middleware.RateLimitByIP("login", 5, time.Minute),
		middleware.MiddlewareLogIn(),
		rout.Handler.HandlerLogIn())

	rout.Router.POST("/register",
		middleware.RateLimitByIP("register", 5, time.Minute),
		middleware.MiddlewareLogOut(),
		rout.Handler.HandlerLogOut())

	rout.Router.POST("/logout",
		middleware.RateLimitByIP("logout", 20, time.Minute),
		middleware.MiddlewareTokenWithTelephon(),
		rout.Handler.HandlerLogoutSession())

	rout.Router.POST("/refresh",
		middleware.RateLimitByIP("refresh", 30, time.Minute),
		rout.Handler.HandlerRefreshToken())

	// ── Account flow (OTP / email codes) ────────────────────────────────────
	rout.Router.POST("/activate",
		middleware.RateLimitByIP("activate", 10, time.Minute),
		middleware.MiddlewareActivateAccount(),
		rout.Handler.HandlerActivateAccount())

	rout.Router.POST("/activate-cuenta",
		middleware.RateLimitByIP("activate_cuenta", 10, time.Minute),
		middleware.MiddlewareRecoverAccount(),
		rout.Handler.HandlerRecoverAccount())

	rout.Router.POST("/resend-code",
		middleware.RateLimitByIP("resend_code", 3, time.Minute),
		middleware.MiddlewareResendCode(),
		rout.Handler.HandlerResendCode())

	rout.Router.POST("/recover-cuenta",
		middleware.RateLimitByIP("recover_cuenta", 10, time.Minute),
		middleware.MiddlewareRecoverCuenta(),
		rout.Handler.HandlerRecoverCuenta())

	rout.Router.POST("/unlock-account",
		middleware.RateLimitByIP("unlock_account", 5, time.Minute),
		middleware.MiddlewareRecoverAndChangePassword(),
		rout.Handler.HandlerRecoverAndChangePassword())

	rout.Router.POST("/forgot-password-send",
		middleware.RateLimitByIP("forgot_pwd_send", 3, time.Minute),
		middleware.MiddlewareSendForgotPasswordCode(),
		rout.Handler.HandlerSendForgotPasswordCode())

	rout.Router.POST("/forgot-password-change",
		middleware.RateLimitByIP("forgot_pwd_change", 5, time.Minute),
		middleware.MiddlewareForgotPasswordChange(),
		rout.Handler.HandlerForgotPasswordChange())
}
