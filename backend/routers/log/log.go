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

// authRoute describe un endpoint de autenticación con su ruta nueva (bajo
// /api/v1/auth) y, si existe, la ruta histórica en la raíz.
type authRoute struct {
	path     string
	legacy   string
	handlers []gin.HandlerFunc
}

// Logs registra todas las rutas de autenticación: registro, login, logout,
// activación de cuenta, recuperación y cambio de contraseña.
//
// Las rutas viven bajo /api/v1/auth para no chocar con las páginas del
// frontend que tienen el mismo nombre (/register, /activate…): así un proxy
// (nginx, Vercel) solo necesita reenviar /api. Las rutas antiguas en la raíz
// se mantienen por compatibilidad.
//
// Los endpoints sensibles tienen límite de peticiones por IP: los que envían
// emails (evita spam) y los de login/códigos (dificulta la fuerza bruta).
func (rout *Log) Logs() {
	authLimit := middleware.NewRateLimiter(20, time.Minute).Middleware()
	emailLimit := middleware.NewRateLimiter(5, 10*time.Minute).Middleware()
	h := rout.Handler

	routes := []authRoute{
		{"login", "/LogIn", []gin.HandlerFunc{authLimit, middleware.MiddlewareLogIn(), h.HandlerLogIn()}},
		{"register", "/register", []gin.HandlerFunc{emailLimit, middleware.MiddlewareLogOut(), h.HandlerLogOut()}},
		{"logout", "/logout", []gin.HandlerFunc{middleware.MiddlewareTokenWithTelephon(), h.HandlerLogoutSession()}},
		{"refresh", "/refresh", []gin.HandlerFunc{authLimit, h.HandlerRefreshToken()}},
		{"activate", "/activate", []gin.HandlerFunc{authLimit, middleware.MiddlewareActivateAccount(), h.HandlerActivateAccount()}},
		// Reenvía el código de activación (por username)
		{"resend-activation", "/activate-cuenta", []gin.HandlerFunc{emailLimit, middleware.MiddlewareRecoverAccount(), h.HandlerRecoverAccount()}},
		// Envía el código de desbloqueo (por email)
		{"resend-unlock-code", "/resend-code", []gin.HandlerFunc{emailLimit, middleware.MiddlewareResendCode(), h.HandlerResendCode()}},
		{"unlock", "/recover-cuenta", []gin.HandlerFunc{authLimit, middleware.MiddlewareRecoverCuenta(), h.HandlerRecoverCuenta()}},
		{"unlock-and-reset", "/unlock-account", []gin.HandlerFunc{authLimit, middleware.MiddlewareRecoverAndChangePassword(), h.HandlerRecoverAndChangePassword()}},
		{"forgot-password", "/forgot-password-send", []gin.HandlerFunc{emailLimit, middleware.MiddlewareSendForgotPasswordCode(), h.HandlerSendForgotPasswordCode()}},
		{"reset-password", "/forgot-password-change", []gin.HandlerFunc{authLimit, middleware.MiddlewareForgotPasswordChange(), h.HandlerForgotPasswordChange()}},
	}

	auth := rout.Router.Group("/api/v1/auth")
	for _, r := range routes {
		auth.POST("/"+r.path, r.handlers...)
		if r.legacy != "" {
			rout.Router.POST(r.legacy, r.handlers...)
		}
	}
}
