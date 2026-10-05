//go:build e2e

// Prueba end-to-end de los endpoints REST de Web Push contra el stack real.
// Por defecto el stack arranca sin claves VAPID (push deshabilitado); si
// GET push/config dice enabled=true también se prueba el ciclo
// alta -> alta duplicada -> baja -> baja idempotente.
//
//	E2E_BASE_URL=http://127.0.0.1:8080 go test -tags e2e ./backend/integration/
package integration

import (
	"encoding/base64"
	"fmt"
	"gorm/backend/database"
	"os"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestE2EPushREST(t *testing.T) {
	base := os.Getenv("E2E_BASE_URL")
	require.NotEmpty(t, base, "E2E_BASE_URL requerido")
	db, err := database.Conection()
	require.NoError(t, err)

	// Shared session: /auth/login has no budget left for another login (see sharedE2ESession).
	c, user := sharedLogin(t)
	t.Cleanup(func() {
		db.Exec(`DELETE FROM push_subscriptions WHERE user_id = ?`, user.ID)
	})
	suffix := time.Now().UnixNano() % 1000000

	p256 := make([]byte, 65)
	p256[0] = 4
	sub := map[string]interface{}{
		"endpoint":       fmt.Sprintf("https://fcm.googleapis.com/fcm/send/e2e-%d", suffix),
		"expirationTime": nil,
		"keys": map[string]string{
			"p256dh": base64.RawURLEncoding.EncodeToString(p256),
			"auth":   base64.RawURLEncoding.EncodeToString(make([]byte, 16)),
		},
	}

	// Sin cookie: 401 en config y en subscribe.
	anon := newClient(t, base)
	code, _ := anon.do("GET", "/api/v1/push/config", nil)
	assert.Equal(t, 401, code)
	code, _ = anon.do("POST", "/api/v1/push/subscribe", sub)
	assert.Equal(t, 401, code)

	code, cfg := c.do("GET", "/api/v1/push/config", nil)
	require.Equal(t, 200, code, cfg)
	enabled, ok := cfg["enabled"].(bool)
	require.True(t, ok, cfg)
	_, hasKey := cfg["publicKey"].(string)
	require.True(t, hasKey, cfg)
	_, hasPreview := cfg["preview"].(bool)
	require.True(t, hasPreview, cfg)

	if !enabled {
		assert.Equal(t, "", cfg["publicKey"])
		code, _ = c.do("POST", "/api/v1/push/subscribe", sub)
		assert.Equal(t, 404, code, "push deshabilitado")
		return
	}

	assert.NotEmpty(t, cfg["publicKey"])
	code, body := c.do("POST", "/api/v1/push/subscribe", sub)
	require.Equal(t, 201, code, body)
	code, body = c.do("POST", "/api/v1/push/subscribe", sub)
	require.Equal(t, 200, code, body)

	unsub := map[string]string{"endpoint": sub["endpoint"].(string)}
	code, _ = c.do("DELETE", "/api/v1/push/subscribe", unsub)
	assert.Equal(t, 204, code)
	code, _ = c.do("DELETE", "/api/v1/push/subscribe", unsub)
	assert.Equal(t, 204, code)
}
