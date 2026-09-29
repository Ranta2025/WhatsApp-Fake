package config

import (
	"log"
	"net/url"
	"os"
	"slices"
	"strings"
	"sync"
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
	"https://cereous-dewayne-sunshiny.ngrok-free.dev",
}

// tunnelDomains son los dominios de túneles (ngrok / cloudflare) permitidos.
// Se comparan como sufijo de subdominio (".dominio") o dominio exacto, nunca
// como sufijo de texto libre: "evilngrok-free.dev" NO debe coincidir.
var tunnelDomains = []string{
	"ngrok-free.app",
	"ngrok-free.dev",
	"ngrok.io",
	"ngrok.app",
	"trycloudflare.com",
}

// extraOrigins contiene orígenes adicionales configurados por la variable de
// entorno CORS_ALLOWED_ORIGINS (lista separada por comas), p. ej. el dominio de producción.
// Se lee de forma perezosa porque el .env se carga en main, después de la
// inicialización de los paquetes.
var extraOrigins = sync.OnceValue(func() []string {
	return parseOriginList(os.Getenv("CORS_ALLOWED_ORIGINS"))
})

func parseOriginList(raw string) []string {
	var origins []string
	for _, o := range strings.Split(raw, ",") {
		if o = strings.TrimRight(strings.TrimSpace(o), "/"); o != "" {
			origins = append(origins, o)
		}
	}
	return origins
}

// IsAllowedOrigin verifica si un origin está en la lista de orígenes permitidos
func IsAllowedOrigin(origin string) bool {
	if origin == "" {
		return false
	}

	if slices.Contains(localOrigins, origin) || slices.Contains(extraOrigins(), origin) {
		return true
	}

	parsed, err := url.Parse(origin)
	if err != nil {
		log.Printf("[CORS] Origin RECHAZADO (inválido): %s", origin)
		return false
	}
	host := parsed.Hostname()
	port := parsed.Port()

	if host == "10.64.222.131" && (port == "5173" || port == "8080") {
		return true
	}

	if (host == "localhost" || host == "127.0.0.1") && (port == "5173" || port == "8080" || port == "") {
		return true
	}

	if parsed.Scheme == "https" || parsed.Scheme == "http" {
		for _, domain := range tunnelDomains {
			if host == domain || strings.HasSuffix(host, "."+domain) {
				return true
			}
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
			"X-Has-More",
		},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	})
}
