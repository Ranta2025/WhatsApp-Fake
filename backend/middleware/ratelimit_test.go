package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// newUnreachableLimiter devuelve un RateLimiter cuyo Redis no responde
// (conexión rechazada inmediata).
func newUnreachableLimiter(t *testing.T) *RateLimiter {
	t.Helper()
	rd := redis.NewClient(&redis.Options{
		Addr:         "127.0.0.1:1",
		DialTimeout:  200 * time.Millisecond,
		ReadTimeout:  200 * time.Millisecond,
		WriteTimeout: 200 * time.Millisecond,
		MaxRetries:   0,
	})
	t.Cleanup(func() { rd.Close() })
	return &RateLimiter{rd: rd}
}

func newMiniredisLimiter(t *testing.T) *RateLimiter {
	t.Helper()
	mr := miniredis.RunT(t)
	rd := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { rd.Close() })
	return &RateLimiter{rd: rd}
}

// C8: ante un error de Redis el rate limiter RECHAZA (fail-closed), nunca
// permite tráfico ilimitado.
func TestAllowFailClosedOnRedisError(t *testing.T) {
	rl := newUnreachableLimiter(t)

	allowed, remaining, _, err := rl.allow("rl:ip:login:1.2.3.4", 10, time.Minute)

	require.Error(t, err)
	assert.False(t, allowed, "fail-closed: Redis caído no puede permitir la petición")
	assert.Zero(t, remaining)
}

// C8: 3 fallos consecutivos abren el circuito; mientras está abierto se
// rechaza sin volver a tocar Redis.
func TestCircuitOpensAfterThreeFailures(t *testing.T) {
	rl := newUnreachableLimiter(t)

	for i := 1; i <= 3; i++ {
		allowed, _, _, err := rl.allow("k", 10, time.Minute)
		assert.Error(t, err)
		assert.False(t, allowed)
	}

	rl.mu.Lock()
	assert.Equal(t, circuitOpen, rl.state, "el circuito debe abrirse tras 3 fallos")
	rl.mu.Unlock()

	// Abierto → sigue rechazando (y sin reintentar Redis).
	allowed, _, _, err := rl.allow("k", 10, time.Minute)
	assert.Error(t, err)
	assert.False(t, allowed)
}

// C8: pasado el cooldown el circuito pasa a half-open; si la prueba falla,
// vuelve a abrirse.
func TestCircuitHalfOpenReopensOnProbeFailure(t *testing.T) {
	rl := newUnreachableLimiter(t)

	rl.mu.Lock()
	rl.state = circuitOpen
	rl.openUntil = time.Now().Add(-time.Second) // cooldown ya superado
	rl.mu.Unlock()

	allowed, _, _, err := rl.allow("k", 10, time.Minute)

	require.Error(t, err)
	assert.False(t, allowed)
	rl.mu.Lock()
	assert.Equal(t, circuitOpen, rl.state, "probe half-open fallido debe reabrir el circuito")
	rl.mu.Unlock()
}

// C8: con Redis sano, la prueba half-open cierra el circuito y la petición pasa.
func TestCircuitHalfOpenRecoversToClosed(t *testing.T) {
	rl := newMiniredisLimiter(t)

	rl.mu.Lock()
	rl.state = circuitOpen
	rl.openUntil = time.Now().Add(-time.Second)
	rl.consecutiveFailures = circuitFailureThreshold
	rl.mu.Unlock()

	allowed, remaining, _, err := rl.allow("k", 10, time.Minute)

	require.NoError(t, err)
	assert.True(t, allowed)
	assert.Equal(t, 9, remaining)
	rl.mu.Lock()
	assert.Equal(t, circuitClosed, rl.state)
	assert.Zero(t, rl.consecutiveFailures)
	rl.mu.Unlock()
}

// R2: INCR+EXPIRE atómicos — el TTL se fija en la primera petición y el
// contador decrementa remaining correctamente hasta superar el límite.
func TestAllowAtomicWindow(t *testing.T) {
	rl := newMiniredisLimiter(t)

	allowed, remaining, resetIn, err := rl.allow("k", 3, time.Minute)
	require.NoError(t, err)
	assert.True(t, allowed)
	assert.Equal(t, 2, remaining)
	assert.InDelta(t, 60, resetIn.Seconds(), 5)

	allowed, remaining, _, _ = rl.allow("k", 3, time.Minute)
	assert.True(t, allowed)
	assert.Equal(t, 1, remaining)

	allowed, remaining, _, _ = rl.allow("k", 3, time.Minute)
	assert.True(t, allowed)
	assert.Equal(t, 0, remaining)

	// Límite superado → rechazado
	allowed, remaining, _, _ = rl.allow("k", 3, time.Minute)
	assert.False(t, allowed)
	assert.Zero(t, remaining)
}

// C8: a nivel middleware, Redis caído → HTTP 503 en todas las peticiones.
func TestRateLimitByIPFailClosedReturns503(t *testing.T) {
	rlGlobal := newUnreachableLimiter(t)
	InitRateLimiter(rlGlobal.rd)
	defer func() { rl = nil }()

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/", RateLimitByIP("login", 10, time.Minute), func(c *gin.Context) {
		c.String(http.StatusOK, "ok")
	})

	for i := 1; i <= 4; i++ {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest("GET", "/", nil))
		assert.Equal(t, http.StatusServiceUnavailable, w.Code, "petición %d debe ser 503", i)
		assert.Contains(t, w.Body.String(), "error")
	}

	rl.mu.Lock()
	assert.Equal(t, circuitOpen, rl.state, "el circuito debe quedar abierto tras los fallos")
	rl.mu.Unlock()
}

// Con Redis sano: peticiones dentro del límite pasan, la que lo supera da 429
// con headers RateLimit.
func TestRateLimitByIPReturns429WhenExceeded(t *testing.T) {
	rl := newMiniredisLimiter(t)
	InitRateLimiter(rl.rd)
	defer func() { rl = nil }()

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/", RateLimitByIP("login", 2, time.Minute), func(c *gin.Context) {
		c.String(http.StatusOK, "ok")
	})

	for i, wantRemaining := range []string{"1", "0"} {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest("GET", "/", nil))
		assert.Equal(t, http.StatusOK, w.Code)
		assert.Equal(t, wantRemaining, w.Header().Get("X-RateLimit-Remaining"), "petición %d", i+1)
	}

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest("GET", "/", nil))
	assert.Equal(t, http.StatusTooManyRequests, w.Code)
	assert.Equal(t, "0", w.Header().Get("X-RateLimit-Remaining"))
}

// Sin InitRateLimiter el middleware deja pasar (no bloquea el arranque).
func TestRateLimitBypassesWhenNotInitialized(t *testing.T) {
	rl = nil

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/", RateLimitByIP("login", 2, time.Minute), func(c *gin.Context) {
		c.String(http.StatusOK, "ok")
	})

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest("GET", "/", nil))
	assert.Equal(t, http.StatusOK, w.Code)
}
