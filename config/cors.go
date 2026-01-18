package config

import (
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func Cors() gin.HandlerFunc {
	return cors.New(cors.Config{
		AllowOrigins: []string{
			"http://localhost:8080",
			"http://127.0.0.1:8080",
		},
		AllowMethods:[]string{
			"GET",
			"POST",
			"PUT",
		},
		AllowHeaders:[]string{
			"origin",
			"Content-Type",
			"Accept",
			"Authorization",
		},
		ExposeHeaders:[]string{
			"Content-Length",
			"Content-Type",
			"Authorization",
		},
		AllowCredentials:true,
		MaxAge:12*time.Hour,
	})
}