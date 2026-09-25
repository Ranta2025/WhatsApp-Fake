package utils

import (
	"net/url"
	"strings"
)

// MaxMediaURLLen es el tamaño de las columnas *_url (size:500).
const MaxMediaURLLen = 500

// allowedMediaTypes son los valores válidos de media_type (ver CHECK constraints en postgres.go).
var allowedMediaTypes = map[string]bool{
	"":         true,
	"image":    true,
	"audio":    true,
	"video":    true,
	"sticker":  true,
	"document": true,
}

// IsValidMediaType indica si el tipo de media está permitido.
func IsValidMediaType(mediaType string) bool {
	return allowedMediaTypes[mediaType]
}

// IsSafeMediaURL indica si la URL puede guardarse y mostrarse a otros usuarios
// (en <img src>, <a href>, window.open...). Solo se permiten rutas del
// almacenamiento propio ("/storage/...", lo que devuelve el endpoint de subida)
// o URLs absolutas http(s). Esto bloquea "javascript:", "data:" y similares,
// que permitirían XSS al hacer clic en un documento enviado por otro usuario.
func IsSafeMediaURL(raw string) bool {
	if raw == "" || len(raw) > MaxMediaURLLen {
		return false
	}
	if strings.HasPrefix(raw, "/storage/") {
		return !strings.Contains(raw, "..") && !strings.ContainsAny(raw, "\\\r\n")
	}
	u, err := url.Parse(raw)
	if err != nil {
		return false
	}
	return (u.Scheme == "http" || u.Scheme == "https") && u.Host != ""
}
