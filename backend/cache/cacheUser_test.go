package cache

import (
	"context"
	"errors"
	"sync"
	"testing"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newTestCacheUser(t *testing.T) (*CacheUser, *miniredis.Miniredis) {
	t.Helper()
	mr := miniredis.RunT(t)
	rd := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rd.Close() })
	return InitChacheUser(rd), mr
}

func TestConsumeRefreshToken_ReturnsOwnerOnceAndRemovesFromUserSet(t *testing.T) {
	ch, mr := newTestCacheUser(t)
	ctx := context.Background()
	require.NoError(t, ch.SaveRefreshToken("+50212345678", "tok", ctx))

	owner, err := ch.ConsumeRefreshToken("tok", ctx)
	require.NoError(t, err)
	assert.Equal(t, "+50212345678", owner)
	assert.False(t, mr.Exists(refreshTokenKey("tok")))
	members, _ := mr.Members(refreshUserKey("+50212345678"))
	assert.NotContains(t, members, refreshTokenKey("tok"))

	_, err = ch.ConsumeRefreshToken("tok", ctx)
	assert.True(t, errors.Is(err, ErrRefreshTokenNotFound), "un token ya consumido debe reportar not-found, got %v", err)
}

func TestConsumeRefreshToken_UnknownToken(t *testing.T) {
	ch, _ := newTestCacheUser(t)
	_, err := ch.ConsumeRefreshToken("forged", context.Background())
	assert.True(t, errors.Is(err, ErrRefreshTokenNotFound))
}

// Varios refresh concurrentes con el mismo token: solo uno puede consumirlo.
func TestConsumeRefreshToken_ConcurrentSingleWinner(t *testing.T) {
	ch, _ := newTestCacheUser(t)
	ctx := context.Background()
	require.NoError(t, ch.SaveRefreshToken("+50212345678", "tok", ctx))

	const n = 10
	var wg sync.WaitGroup
	var mu sync.Mutex
	wins, notFound := 0, 0
	start := make(chan struct{})
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			owner, err := ch.ConsumeRefreshToken("tok", ctx)
			mu.Lock()
			defer mu.Unlock()
			switch {
			case err == nil && owner == "+50212345678":
				wins++
			case errors.Is(err, ErrRefreshTokenNotFound):
				notFound++
			}
		}()
	}
	close(start)
	wg.Wait()
	assert.Equal(t, 1, wins)
	assert.Equal(t, n-1, notFound)
}

func TestDeleteRefreshToken_IdempotentForLogout(t *testing.T) {
	ch, _ := newTestCacheUser(t)
	ctx := context.Background()
	require.NoError(t, ch.SaveRefreshToken("+50212345678", "tok", ctx))
	assert.NoError(t, ch.DeleteRefreshToken("tok", ctx))
	assert.NoError(t, ch.DeleteRefreshToken("tok", ctx))
}
