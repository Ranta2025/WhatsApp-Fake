package middleware

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

// ─────────────────────────────────────────────────────────────────────────────
// RateLimiter
//
// Fixed-window rate limiter backed by Redis.
// The counter is incremented atomically via a Lua script so the INCR + EXPIRE
// is a single round-trip and race-condition free.
//
// Key schema:
//   rl:ip:<tag>:<ip>          – IP-based (public endpoints)
//   rl:user:<tag>:<telephon>  – User-based (authenticated endpoints)
//
// Usage:
//   middleware.InitRateLimiter(rd)   // once at startup
//   middleware.RateLimitByIP("login", 10, time.Minute)
//   middleware.RateLimitByUser("send_msg", 60, time.Minute)
// ─────────────────────────────────────────────────────────────────────────────

var rl *RateLimiter

// errCircuitOpen se devuelve cuando el circuito está abierto y la petición se
// rechaza sin consultar Redis.
var errCircuitOpen = errors.New("rate limiter: circuito abierto (Redis no disponible)")

// circuitState modela el estado del circuit breaker del rate limiter.
type circuitState int

const (
	// circuitClosed: Redis responde normal; se cuentan los fallos.
	circuitClosed circuitState = iota
	// circuitOpen: Redis falló repetidamente; se rechaza con 503 sin consultarlo.
	circuitOpen
	// circuitHalfOpen: cooldown superado; la siguiente petición prueba Redis.
	circuitHalfOpen
)

// circuitFailureThreshold: cantidad de fallos consecutivos de Redis antes de
// abrir el circuito.
const circuitFailureThreshold = 3

// circuitCooldown: tiempo que el circuito permanece abierto antes de probar
// Redis de nuevo. Es var para poder acortarlo en tests.
var circuitCooldown = 30 * time.Second

// RateLimiter holds the Redis client used for all rate-limit counters.
type RateLimiter struct {
	rd *redis.Client

	mu                  sync.Mutex
	state               circuitState
	openUntil           time.Time
	consecutiveFailures int
}

// InitRateLimiter must be called once before any route is registered.
func InitRateLimiter(rd *redis.Client) {
	rl = &RateLimiter{rd: rd}
}

// ─── Core: atomic fixed-window increment ─────────────────────────────────────

// luaIncr increments a counter and sets expiry only on first creation.
// Returns {current, ttl} as a Lua table.
var luaIncr = redis.NewScript(`
local current = redis.call("INCR", KEYS[1])
if current == 1 then
    redis.call("EXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("TTL", KEYS[1])
return {current, ttl}
`)

// allow incrementa el contador atómicamente. Ante un error de Redis la
// petición NO se permite (fail-closed, C8): devuelve err y el middleware
// responde 503. Tras circuitFailureThreshold fallos consecutivos el circuito
// se abre (rechazo sin tocar Redis); pasado circuitCooldown pasa a half-open y
// la siguiente petición prueba Redis: si funciona, vuelve a closed; si no,
// vuelve a abrirse.
func (r *RateLimiter) allow(key string, limit int, window time.Duration) (allowed bool, remaining int, resetIn time.Duration, err error) {
	ctx := context.Background()
	windowSecs := int(window.Seconds())

	// Circuito abierto: rechazar sin consultar Redis (fail-closed).
	r.mu.Lock()
	if r.state == circuitOpen {
		if time.Now().Before(r.openUntil) {
			r.mu.Unlock()
			return false, 0, 0, errCircuitOpen
		}
		// Cooldown superado → half-open: esta petición prueba Redis.
		r.state = circuitHalfOpen
	}
	r.mu.Unlock()

	vals, err := luaIncr.Run(ctx, r.rd, []string{key}, windowSecs).Slice()
	if err != nil {
		slog.Error("rate limiter: Redis no disponible, rechazando (fail-closed)", "error", err)
		r.mu.Lock()
		r.consecutiveFailures++
		if r.consecutiveFailures >= circuitFailureThreshold || r.state == circuitHalfOpen {
			r.state = circuitOpen
			r.openUntil = time.Now().Add(circuitCooldown)
		}
		r.mu.Unlock()
		return false, 0, 0, err
	}

	// Éxito → el circuito se cierra.
	r.mu.Lock()
	if r.state == circuitHalfOpen {
		r.state = circuitClosed
	}
	r.consecutiveFailures = 0
	r.mu.Unlock()

	count, _ := vals[0].(int64)
	ttlSecs, _ := vals[1].(int64)

	if ttlSecs <= 0 {
		ttlSecs = int64(windowSecs)
	}

	remaining = limit - int(count)
	if remaining < 0 {
		remaining = 0
	}
	return int(count) <= limit, remaining, time.Duration(ttlSecs) * time.Second, nil
}

// ─── Public factory functions ─────────────────────────────────────────────────

// RateLimitByIP limits by client IP address.
// Suitable for unauthenticated endpoints (login, register, forgot-password…).
//
//	tag    – unique name used as part of the Redis key (e.g. "login")
//	limit  – max requests allowed inside the window
//	window – duration of the fixed window
func RateLimitByIP(tag string, limit int, window time.Duration) gin.HandlerFunc {
	return func(ctx *gin.Context) {
		if rl == nil {
			ctx.Next()
			return
		}

		ip := ctx.ClientIP()
		key := fmt.Sprintf("rl:ip:%s:%s", tag, ip)
		allowed, remaining, resetIn, err := rl.allow(key, limit, window)

		if err != nil {
			// Fail-closed (C8): Redis no disponible → 503, nunca tráfico ilimitado.
			slog.Error("rate limiter rechazando petición por indisponibilidad de Redis", "key", key, "error", err)
			ctx.JSON(http.StatusServiceUnavailable, gin.H{
				"error": "servicio temporalmente no disponible, intente más tarde",
			})
			ctx.Abort()
			return
		}

		setRateLimitHeaders(ctx, limit, remaining, resetIn)
		if !allowed {
			ctx.JSON(http.StatusTooManyRequests, gin.H{
				"error":       "Demasiadas solicitudes. Intenta de nuevo más tarde.",
				"retry_after": int(resetIn.Seconds()),
			})
			ctx.Abort()
			return
		}
		ctx.Next()
	}
}

// RateLimitByUser limits by the authenticated user's phone number.
// Falls back to IP if the token middleware hasn't run yet (shouldn't happen in practice).
//
//	tag    – unique name used as part of the Redis key (e.g. "send_msg")
//	limit  – max requests allowed inside the window
//	window – duration of the fixed window
func RateLimitByUser(tag string, limit int, window time.Duration) gin.HandlerFunc {
	return func(ctx *gin.Context) {
		if rl == nil {
			ctx.Next()
			return
		}

		// Prefer the telephon set by MiddlewareTokenWithTelephon
		var subject string
		if telephon, exists := ctx.Get("telephon"); exists {
			subject = telephon.(string)
		} else {
			subject = ctx.ClientIP()
		}

		key := fmt.Sprintf("rl:user:%s:%s", tag, subject)
		allowed, remaining, resetIn, err := rl.allow(key, limit, window)

		if err != nil {
			// Fail-closed (C8): Redis no disponible → 503, nunca tráfico ilimitado.
			slog.Error("rate limiter rechazando petición por indisponibilidad de Redis", "key", key, "error", err)
			ctx.JSON(http.StatusServiceUnavailable, gin.H{
				"error": "servicio temporalmente no disponible, intente más tarde",
			})
			ctx.Abort()
			return
		}

		setRateLimitHeaders(ctx, limit, remaining, resetIn)
		if !allowed {
			ctx.JSON(http.StatusTooManyRequests, gin.H{
				"error":       "Has superado el límite de solicitudes. Intenta de nuevo más tarde.",
				"retry_after": int(resetIn.Seconds()),
			})
			ctx.Abort()
			return
		}
		ctx.Next()
	}
}

// setRateLimitHeaders writes standard RateLimit response headers.
func setRateLimitHeaders(ctx *gin.Context, limit, remaining int, resetIn time.Duration) {
	ctx.Header("X-RateLimit-Limit", fmt.Sprintf("%d", limit))
	ctx.Header("X-RateLimit-Remaining", fmt.Sprintf("%d", remaining))
	ctx.Header("X-RateLimit-Reset", fmt.Sprintf("%d", int(resetIn.Seconds())))
}
