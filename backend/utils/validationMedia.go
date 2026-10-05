package utils

import (
	"net/url"
	"regexp"
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

// builtinStickerURL matches the paths of the stickers shipped with the app:
// /stickers/<pack>/<name>.webp, limited to lowercase letters, digits and dashes.
// The allowed character set already excludes queries, uppercase and traversal.
var builtinStickerURL = regexp.MustCompile(`^/stickers/[a-z0-9-]{1,40}/[a-z0-9-]{1,60}\.webp$`)

// IsBuiltinStickerURL reports whether raw is the path of an app-provided sticker.
// Builtin stickers do not go through the upload storage, so they need their own
// allowlist. The length is bounded by MaxMediaURLLen and ".." is rejected
// explicitly as defense in depth.
func IsBuiltinStickerURL(raw string) bool {
	if raw == "" || len(raw) > MaxMediaURLLen {
		return false
	}
	if strings.Contains(raw, "..") {
		return false
	}
	return builtinStickerURL.MatchString(raw)
}
