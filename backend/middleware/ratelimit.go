package middleware

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
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

// RateLimiter holds the Redis client used for all rate-limit counters.
type RateLimiter struct {
	rd *redis.Client
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

func (r *RateLimiter) allow(key string, limit int, window time.Duration) (allowed bool, remaining int, resetIn time.Duration) {
	ctx := context.Background()
	windowSecs := int(window.Seconds())

	vals, err := luaIncr.Run(ctx, r.rd, []string{key}, windowSecs).Slice()
	if err != nil {
		slog.Error("rate limiter: Redis no disponible, permitiendo (fail-open)", "error", err)
		return true, limit, window
	}

	count, _ := vals[0].(int64)
	ttlSecs, _ := vals[1].(int64)

	if ttlSecs <= 0 {
		ttlSecs = int64(window.Seconds())
	}

	remaining = limit - int(count)
	if remaining < 0 {
		remaining = 0
	}
	return int(count) <= limit, remaining, time.Duration(ttlSecs) * time.Second
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
		allowed, remaining, resetIn := rl.allow(key, limit, window)

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
		allowed, remaining, resetIn := rl.allow(key, limit, window)

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
