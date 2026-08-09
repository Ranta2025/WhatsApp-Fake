package cache

import (
	"context"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// newTestCacheUser crea un CacheUser con miniredis. El repo se deja en nil:
// los métodos bajo prueba (códigos, intentos fallidos) son solo Redis.
func newTestCacheUser(t *testing.T) (*CacheUser, *miniredis.Miniredis) {
	t.Helper()
	mr := miniredis.RunT(t)
	rd := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { rd.Close() })
	return &CacheUser{rd: rd, repo: nil}, mr
}

// 2.5: el código de activación se elimina tras su uso — reutilizarlo debe
// fallar (la clave ya no existe en Redis).
func TestCacheUser_DeleteActivationCode(t *testing.T) {
	ch, _ := newTestCacheUser(t)
	ctx := context.Background()

	require.NoError(t, ch.SetCodigo("activacion", "alice", "123456", ctx))

	// Antes de usarlo el código existe
	code, err := ch.GetCodigo("activacion", "alice", ctx)
	require.NoError(t, err)
	assert.Equal(t, "123456", code)

	// Tras usarlo, el código desaparece
	require.NoError(t, ch.DeleteActivationCode("alice", ctx))
	_, err = ch.GetCodigo("activacion", "alice", ctx)
	assert.Error(t, err)
	assert.ErrorIs(t, err, redis.Nil)
}

// 2.5: tras un login exitoso el contador de intentos fallidos se resetea a 0.
func TestCacheUser_ResetFailedAttempts(t *testing.T) {
	ch, _ := newTestCacheUser(t)
	ctx := context.Background()

	// 3 intentos fallidos acumulados
	for i := 0; i < 3; i++ {
		n, err := ch.IncrementFailedAttempts("alice", ctx)
		require.NoError(t, err)
		assert.Equal(t, i+1, n)
	}
	n, err := ch.GetIntentosFallidos("alice", ctx)
	require.NoError(t, err)
	assert.Equal(t, 3, n)

	// Login exitoso → reset
	require.NoError(t, ch.ResetFailedAttempts("alice", ctx))
	n, err = ch.GetIntentosFallidos("alice", ctx)
	require.NoError(t, err)
	assert.Equal(t, 0, n)
}

// El INCR es atómico y el TTL de 30 min se aplica al primer intento.
func TestCacheUser_IncrementFailedAttemptsTTL(t *testing.T) {
	ch, mr := newTestCacheUser(t)
	ctx := context.Background()

	_, err := ch.IncrementFailedAttempts("bob", ctx)
	require.NoError(t, err)
	_, err = ch.IncrementFailedAttempts("bob", ctx)
	require.NoError(t, err)

	ttl := mr.TTL("intentos:bob")
	assert.Greater(t, ttl, 29*time.Minute)
	assert.LessOrEqual(t, ttl, 30*time.Minute)

	_, err = ch.IncrementFailedAttempts("carlos", ctx)
	require.NoError(t, err)
	ttl = mr.TTL("intentos:carlos")
	assert.Greater(t, ttl, 29*time.Minute)
}
