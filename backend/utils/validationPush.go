package utils

import (
	"encoding/base64"
	"net/url"
	"strings"
)

// MaxPushEndpointLen es el largo máximo aceptado para el endpoint de una
// suscripción Web Push (los reales rondan los 200-500 caracteres).
const MaxPushEndpointLen = 1024

// Tamaños decodificados de las claves de una suscripción Web Push (RFC 8291):
// p256dh es un punto P-256 sin comprimir (65 bytes) y auth un secreto de 16.
const (
	pushP256dhLen = 65
	pushAuthLen   = 16
	// maxPushKeyLen acota la cadena antes de decodificar (base64 de 65 bytes
	// con padding son 88 caracteres).
	maxPushKeyLen = 128
)

// allowedPushHosts son los servicios de push de los navegadores. Se acepta el
// host exacto o cualquier subdominio (con límite de punto, nunca sufijo crudo).
var allowedPushHosts = []string{
	"fcm.googleapis.com",
	"android.googleapis.com",
	"push.services.mozilla.com",
	"push.apple.com",
	"notify.windows.com",
}

// IsAllowedPushEndpoint indica si el endpoint de una suscripción apunta a un
// servicio de push conocido. Es la defensa contra SSRF: el backend hará POST a
// esta URL, así que solo se aceptan https, sin userinfo, sin puerto distinto
// de 443 y con un host de la allowlist (igual o subdominio con punto).
func IsAllowedPushEndpoint(raw string) bool {
	if raw == "" || len(raw) > MaxPushEndpointLen {
		return false
	}
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.User != nil || u.Opaque != "" {
		return false
	}
	if port := u.Port(); port != "" && port != "443" {
		return false
	}
	host := strings.ToLower(u.Hostname())
	if host == "" {
		return false
	}
	for _, allowed := range allowedPushHosts {
		if host == allowed || strings.HasSuffix(host, "."+allowed) {
			return true
		}
	}
	return false
}

// ValidPushKeys valida las claves de la suscripción: base64url (con o sin
// padding) que decodifican exactamente a 65 bytes (p256dh) y 16 bytes (auth).
func ValidPushKeys(p256dh, auth string) bool {
	return decodedLen(p256dh) == pushP256dhLen && decodedLen(auth) == pushAuthLen
}

// decodedLen devuelve el largo decodificado de s en base64url, o -1 si está
// vacía, es demasiado larga o no es base64url válido.
func decodedLen(s string) int {
	if s == "" || len(s) > maxPushKeyLen {
		return -1
	}
	b, err := base64.RawURLEncoding.DecodeString(strings.TrimRight(s, "="))
	if err != nil {
		return -1
	}
	return len(b)
}
