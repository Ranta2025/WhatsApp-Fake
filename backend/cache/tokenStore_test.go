package cache

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newTestTokenStore(t *testing.T) (TokenStore, *miniredis.Miniredis) {
	t.Helper()
	mr := miniredis.RunT(t)
	rd := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { rd.Close() })
	return NewRedisTokenStore(rd), mr
}

func TestRedisTokenStore_SaveAndValidate(t *testing.T) {
	store, _ := newTestTokenStore(t)
	ctx := context.Background()

	require.NoError(t, store.SaveRefreshToken("user1", "token-abc", ctx))
	assert.NoError(t, store.ValidateRefreshToken("user1", "token-abc", ctx))
	assert.Error(t, store.ValidateRefreshToken("user1", "token-wrong", ctx))
	assert.Error(t, store.ValidateRefreshToken("nobody", "token-abc", ctx))
}

// C1: la rotación es atómica — tras RotateRefreshToken el token viejo queda
// invalidado y el nuevo es válido (DEL old + SET new en una sola operación).
func TestRedisTokenStore_RotateRefreshToken(t *testing.T) {
	store, _ := newTestTokenStore(t)
	ctx := context.Background()

	require.NoError(t, store.SaveRefreshToken("user1", "old-token", ctx))

	require.NoError(t, store.RotateRefreshToken("old-token", "new-token", "user1", ctx))

	// El token viejo ya no es válido
	err := store.ValidateRefreshToken("user1", "old-token", ctx)
	require.Error(t, err)
	// El token nuevo sí es válido
	assert.NoError(t, store.ValidateRefreshToken("user1", "new-token", ctx))
}

// C1: rotar con un token viejo obsoleto (p.ej. doble refresh concurrente)
// debe fallar SIN guardar el token nuevo.
func TestRedisTokenStore_RotateRefreshTokenStaleOldToken(t *testing.T) {
	store, _ := newTestTokenStore(t)
	ctx := context.Background()

	require.NoError(t, store.SaveRefreshToken("user1", "current-token", ctx))

	err := store.RotateRefreshToken("stale-token", "new-token", "user1", ctx)
	require.Error(t, err)

	// El token almacenado sigue siendo el actual; el "nuevo" no se guardó
	assert.NoError(t, store.ValidateRefreshToken("user1", "current-token", ctx))
	assert.Error(t, store.ValidateRefreshToken("user1", "new-token", ctx))
}

func TestRedisTokenStore_DeleteAndRevoke(t *testing.T) {
	store, _ := newTestTokenStore(t)
	ctx := context.Background()

	require.NoError(t, store.SaveRefreshToken("user1", "token-abc", ctx))
	require.NoError(t, store.DeleteRefreshToken("user1", ctx))
	assert.Error(t, store.ValidateRefreshToken("user1", "token-abc", ctx))

	require.NoError(t, store.SaveRefreshToken("user2", "token-xyz", ctx))
	require.NoError(t, store.RevokeAllForUser("user2", ctx))
	assert.Error(t, store.ValidateRefreshToken("user2", "token-xyz", ctx))
}

func TestRedisTokenStore_Blacklist(t *testing.T) {
	store, _ := newTestTokenStore(t)
	ctx := context.Background()

	blacklisted, err := store.IsBlacklisted("jti-123", ctx)
	require.NoError(t, err)
	assert.False(t, blacklisted)

	require.NoError(t, store.BlacklistToken("jti-123", 5*time.Minute, ctx))

	blacklisted, err = store.IsBlacklisted("jti-123", ctx)
	require.NoError(t, err)
	assert.True(t, blacklisted)
}

// El TTL de la clave refresh debe ser 7 días (RefreshTokenDuration).
func TestRedisTokenStore_SaveSetsTTL(t *testing.T) {
	store, mr := newTestTokenStore(t)
	ctx := context.Background()
	want := (7 * 24 * time.Hour).Seconds()

	require.NoError(t, store.SaveRefreshToken("user1", "token-abc", ctx))
	assert.InDelta(t, want, mr.TTL("refresh:user1").Seconds(), 5)

	require.NoError(t, store.RotateRefreshToken("token-abc", "token-new", "user1", ctx))
	assert.InDelta(t, want, mr.TTL("refresh:user1").Seconds(), 5)
}

// La rotación debe fallar limpiamente si Redis no está disponible.
func TestRedisTokenStore_RotateFailsWithoutRedis(t *testing.T) {
	rd := redis.NewClient(&redis.Options{Addr: "127.0.0.1:1"})
	t.Cleanup(func() { rd.Close() })
	store := NewRedisTokenStore(rd)

	err := store.RotateRefreshToken("old", "new", "user1", context.Background())
	require.Error(t, err)
	require.False(t, errors.Is(err, nil))
}
