package config

import (
	"log"
	"net/url"
	"os"
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
}

// allowedOrigins adicionales leídos de la variable de entorno ALLOWED_ORIGINS
var allowedOrigins []string

func init() {
	raw := os.Getenv("ALLOWED_ORIGINS")
	if raw != "" {
		for _, origin := range strings.Split(raw, ",") {
			origin = strings.TrimSpace(origin)
			if origin != "" {
				allowedOrigins = append(allowedOrigins, origin)
			}
		}
	}
}

// IsAllowedOrigin verifica si un origin está en la lista de orígenes permitidos
func IsAllowedOrigin(origin string) bool {
	if origin == "" {
		return true
	}

	parsed, err := url.Parse(origin)
	if err == nil {
		host := parsed.Hostname()
		port := parsed.Port()

		if host == "10.64.222.131" && (port == "5173" || port == "8080") {
			return true
		}

		if (host == "localhost" || host == "127.0.0.1") && (port == "5173" || port == "8080" || port == "") {
			return true
		}
	}

	for _, allowed := range localOrigins {
		if origin == allowed {
			return true
		}
	}

	for _, allowed := range allowedOrigins {
		if origin == allowed {
			return true
		}
	}

	log.Printf("[CORS] Origin RECHAZADO: %s", origin)
	return false
}

// Cors devuelve el middleware de CORS configurado con los orígenes, métodos y
// cabeceras permitidos para la aplicación.
func Cors() gin.HandlerFunc {
	return cors.New(cors.Config{
		AllowOriginFunc: func(origin string) bool {
			return IsAllowedOrigin(origin)
		},
		AllowMethods: []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
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
