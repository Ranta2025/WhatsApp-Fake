package config

import (
	"net/url"
	"strings"
)

// PushConfig es la configuración de Web Push (VAPID). Si falta alguna clave o
// el subject no es válido la funcionalidad queda deshabilitada: el endpoint de
// configuración responde enabled=false y el envío es un no-op.
type PushConfig struct {
	Enabled    bool
	PublicKey  string
	PrivateKey string
	Subject    string
	// Preview=false (PUSH_PREVIEW=off) fuerza para todos los usuarios el cuerpo
	// genérico, sin texto del mensaje.
	Preview bool
}

// LoadPushConfig lee VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT y
// PUSH_PREVIEW. Recibe getenv para poder testearse (os.Getenv en producción).
func LoadPushConfig(getenv func(string) string) PushConfig {
	cfg := PushConfig{Preview: !isOff(getenv("PUSH_PREVIEW"))}
	pub := strings.TrimSpace(getenv("VAPID_PUBLIC_KEY"))
	priv := strings.TrimSpace(getenv("VAPID_PRIVATE_KEY"))
	subject := strings.TrimSpace(getenv("VAPID_SUBJECT"))
	if pub == "" || priv == "" || !validVAPIDSubject(subject) {
		return cfg
	}
	cfg.Enabled = true
	cfg.PublicKey = pub
	cfg.PrivateKey = priv
	cfg.Subject = subject
	return cfg
}

// validVAPIDSubject acepta "mailto:<dirección>" o una URL https (RFC 8292).
func validVAPIDSubject(s string) bool {
	if addr, ok := strings.CutPrefix(s, "mailto:"); ok {
		return strings.Contains(addr, "@")
	}
	u, err := url.Parse(s)
	return err == nil && u.Scheme == "https" && u.Host != ""
}

func isOff(v string) bool {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "off", "false", "0", "no":
		return true
	}
	return false
}
