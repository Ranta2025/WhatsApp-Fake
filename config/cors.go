package config

import (
	"os"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func Cors() gin.HandlerFunc {
	return cors.New(cors.Config{
		AllowOriginFunc: func(origin string) bool {
			// Permite localhost para desarrollo
			if origin == "http://localhost:8080" ||
				origin == "http://localhost:5173" ||
				origin == "http://127.0.0.1:8080" ||
				origin == "http://127.0.0.1:5173" {
				return true
			}
			// Permite origen definido en variable de entorno
			envOrigin := os.Getenv("FRONTEND_URL")
			return envOrigin != "" && origin == envOrigin
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
