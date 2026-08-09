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

func (rout *Log) Logs() {
	rout.Router.Use(middleware.RequireJSON())

	// ── Brute-force sensitive ────────────────────────────────────────────────
	rout.Router.POST("/LogIn",
		middleware.RateLimitByIP("login", 5, time.Minute),
		middleware.MiddlewareLogIn(),
		rout.Handler.HandlerLogIn())

	rout.Router.POST("/register",
		middleware.RateLimitByIP("register", 5, time.Minute),
		middleware.MiddlewareRegister(),
		rout.Handler.HandlerRegister())

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
