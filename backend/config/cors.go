package config

import (
	"strings"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

// localOrigins es la lista de orígenes permitidos
var localOrigins = []string{
	"http://localhost:8080",
	"http://127.0.0.1:8080",
	"http://localhost:5173",
	"http://127.0.0.1:5173",
	"http://10.33.225.131:5173",
	"http://10.33.225.131:8080",
	"http://10.50.148.131:8080",
	"http://10.50.148.131:5173",
	"http://10.50.249.108:8080",
	"http://10.50.249.108:5173",
}

// IsAllowedOrigin verifica si un origin está en la lista de orígenes permitidos
func IsAllowedOrigin(origin string) bool {
	for _, allowed := range localOrigins {
		if origin == allowed {
			return true
		}
	}
	if strings.Contains(origin, ".ngrok-free.app") ||
		strings.Contains(origin, ".ngrok.io") ||
		strings.Contains(origin, ".ngrok.app") {
		return true
	}
	return false
}

func Cors() gin.HandlerFunc {
	return cors.New(cors.Config{
		AllowOriginFunc: func(origin string) bool {
			return IsAllowedOrigin(origin)
		},
		AllowMethods: []string{"GET", "POST", "PUT", "OPTIONS"},
		AllowHeaders: []string{
			"origin",
			"Content-Type",
			"Accept",
			"Authorization",
			"X-Requested-With",
		},
		ExposeHeaders: []string{
			"Content-Length",
			"Content-Type",
			"Authorization",
		},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	})
}
