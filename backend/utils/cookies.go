package utils

import "os"

// SecureCookies indica si las cookies de sesión deben llevar el flag Secure
// (solo HTTPS). COOKIE_SECURE=true/false lo fuerza; si no está definida, se
// activa en producción (ENV=production). En local por HTTP debe ser false.
func SecureCookies() bool {
	switch os.Getenv("COOKIE_SECURE") {
	case "true":
		return true
	case "false":
		return false
	}
	return os.Getenv("ENV") == "production"
}
