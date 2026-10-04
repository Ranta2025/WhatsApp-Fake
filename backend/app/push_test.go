package app

import (
	"context"
	"testing"

	"gorm/backend/config"
	"gorm/backend/repos"
	"gorm/backend/schemas"
	"gorm/backend/services"

	"github.com/stretchr/testify/assert"
)

func TestPushStartupMessageNeverLeaksKeys(t *testing.T) {
	on := pushStartupMessage(config.PushConfig{Enabled: true, PublicKey: "PUBKEY", PrivateKey: "PRIVKEY", Subject: "mailto:a@b.c", Preview: true})
	assert.Contains(t, on, "habilitado")
	assert.NotContains(t, on, "deshabilitado")
	for _, secret := range []string{"PUBKEY", "PRIVKEY"} {
		assert.NotContains(t, on, secret)
	}
	off := pushStartupMessage(config.PushConfig{Preview: false})
	assert.Contains(t, off, "deshabilitado")
}

func TestBuildPushNotifier(t *testing.T) {
	off := buildPushNotifier(config.PushConfig{}, &repos.RepoPush{}, &repos.ApiContact{}, &repos.RepoGroup{}, &repos.RepoMute{})
	assert.IsType(t, services.NoopPushNotifier{}, off)

	on := buildPushNotifier(config.PushConfig{Enabled: true, PublicKey: "p", PrivateKey: "k", Subject: "mailto:a@b.c"}, &repos.RepoPush{}, &repos.ApiContact{}, &repos.RepoGroup{}, &repos.RepoMute{})
	d, ok := on.(*services.PushDispatcher)
	assert.True(t, ok)
	d.Close()
}

func TestPushNotifierCloser(t *testing.T) {
	assert.NotPanics(t, func() { _ = pushNotifierCloser(services.NoopPushNotifier{})(context.Background()) })

	on := buildPushNotifier(config.PushConfig{Enabled: true, PublicKey: "p", PrivateKey: "k", Subject: "mailto:a@b.c"}, &repos.RepoPush{}, &repos.ApiContact{}, &repos.RepoGroup{}, &repos.RepoMute{})
	assert.NoError(t, pushNotifierCloser(on)(context.Background()))
	// Tras cerrar, notificar no encola nada ni entra en pánico.
	assert.NotPanics(t, func() { on.NotifyDirect("+2", "+1", schemas.Message{Message: "hola"}) })
}

func TestPushNotifierCloserNoopAndIdleDispatcher(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	assert.NoError(t, pushNotifierCloser(services.NoopPushNotifier{})(ctx))

	on := buildPushNotifier(config.PushConfig{Enabled: true, PublicKey: "p", PrivateKey: "k", Subject: "mailto:a@b.c"}, &repos.RepoPush{}, &repos.ApiContact{}, &repos.RepoGroup{}, &repos.RepoMute{})
	// Sin trabajos pendientes el cierre termina enseguida.
	assert.NoError(t, pushNotifierCloser(on)(context.Background()))
}
