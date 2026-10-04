package app

import (
	"fmt"
	"gorm/backend/config"
	"gorm/backend/repos"
	"gorm/backend/services"
)

// pushStartupMessage describe el estado de Web Push para el log de arranque.
// Nunca incluye las claves VAPID.
func pushStartupMessage(cfg config.PushConfig) string {
	if !cfg.Enabled {
		return "[PUSH] Web Push deshabilitado (faltan VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT válidos)"
	}
	return fmt.Sprintf("[PUSH] Web Push habilitado (preview global: %t)", cfg.Preview)
}

// buildPushNotifier construye el despacho de Web Push (pool de workers con el
// emisor webpush-go real), o un no-op si el push está deshabilitado.
func buildPushNotifier(cfg config.PushConfig, repoPush *repos.RepoPush, repoContact *repos.ApiContact, repoGroup *repos.RepoGroup) services.PushNotifier {
	if !cfg.Enabled {
		return services.NoopPushNotifier{}
	}
	return services.NewPushNotifier(cfg, services.PushDispatcherDeps{
		Repo:   repoPush,
		Users:  repoContact,
		Groups: repoGroup,
		Sender: services.NewWebPushSender(cfg),
	})
}
