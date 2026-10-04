package app

import (
	"fmt"
	"gorm/backend/config"
)

// pushStartupMessage describe el estado de Web Push para el log de arranque.
// Nunca incluye las claves VAPID.
func pushStartupMessage(cfg config.PushConfig) string {
	if !cfg.Enabled {
		return "[PUSH] Web Push deshabilitado (faltan VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT válidos)"
	}
	return fmt.Sprintf("[PUSH] Web Push habilitado (preview global: %t)", cfg.Preview)
}
