package app

import (
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
	off := buildPushNotifier(config.PushConfig{}, &repos.RepoPush{}, &repos.ApiContact{}, &repos.RepoGroup{})
	assert.IsType(t, services.NoopPushNotifier{}, off)

	on := buildPushNotifier(config.PushConfig{Enabled: true, PublicKey: "p", PrivateKey: "k", Subject: "mailto:a@b.c"}, &repos.RepoPush{}, &repos.ApiContact{}, &repos.RepoGroup{})
	d, ok := on.(*services.PushDispatcher)
	assert.True(t, ok)
	d.Close()
}

func TestPushNotifierCloser(t *testing.T) {
	assert.NotPanics(t, pushNotifierCloser(services.NoopPushNotifier{}))

	on := buildPushNotifier(config.PushConfig{Enabled: true, PublicKey: "p", PrivateKey: "k", Subject: "mailto:a@b.c"}, &repos.RepoPush{}, &repos.ApiContact{}, &repos.RepoGroup{})
	pushNotifierCloser(on)()
	// Tras cerrar, notificar no encola nada ni entra en pánico.
	assert.NotPanics(t, func() { on.NotifyDirect("+2", "+1", schemas.Message{Message: "hola"}) })
}
