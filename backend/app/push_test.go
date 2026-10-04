package app

import (
	"testing"

	"gorm/backend/config"

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
