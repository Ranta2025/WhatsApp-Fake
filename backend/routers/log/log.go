package log

import (
	"gorm/backend/handlers"
	"gorm/backend/middleware"

	"github.com/gin-gonic/gin"
)

type Log struct {
	Router  *gin.Engine
	Handler handlers.HandlerUser
}

func (rout *Log) Logs() {
	rout.Router.POST("/LogIn", middleware.MiddlewareLogIn(), rout.Handler.HandlerLogIn())
	rout.Router.POST("/register", middleware.MiddlewareLogOut(), rout.Handler.HandlerLogOut())
	rout.Router.POST("/logout", middleware.MiddlewareTokenWithTelephon(), rout.Handler.HandlerLogoutSession())
	rout.Router.POST("/refresh", rout.Handler.HandlerRefreshToken())
	rout.Router.POST("/activate", middleware.MiddlewareActivateAccount(), rout.Handler.HandlerActivateAccount())
	rout.Router.POST("/activate-cuenta", middleware.MiddlewareRecoverAccount(), rout.Handler.HandlerRecoverAccount())
	rout.Router.POST("/resend-code", middleware.MiddlewareResendCode(), rout.Handler.HandlerResendCode())
	rout.Router.POST("/recover-cuenta", middleware.MiddlewareRecoverCuenta(), rout.Handler.HandlerRecoverCuenta())
	rout.Router.POST("/unlock-account", middleware.MiddlewareRecoverAndChangePassword(), rout.Handler.HandlerRecoverAndChangePassword())
	rout.Router.POST("/forgot-password-send", middleware.MiddlewareSendForgotPasswordCode(), rout.Handler.HandlerSendForgotPasswordCode())
	rout.Router.POST("/forgot-password-change", middleware.MiddlewareForgotPasswordChange(), rout.Handler.HandlerForgotPasswordChange())
}
