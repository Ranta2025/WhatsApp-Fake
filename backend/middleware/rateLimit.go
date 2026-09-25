package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// rateWindow cuenta las peticiones de una clave dentro de la ventana actual.
type rateWindow struct {
	start time.Time
	count int
}

// RateLimiter limita el número de peticiones por IP en una ventana fija de tiempo.
// Es un limitador en memoria (suficiente para una sola instancia del backend).
type RateLimiter struct {
	mu      sync.Mutex
	limit   int
	window  time.Duration
	entries map[string]*rateWindow
}

// NewRateLimiter crea un limitador de `limit` peticiones por `window` y por IP.
func NewRateLimiter(limit int, window time.Duration) *RateLimiter {
	rl := &RateLimiter{limit: limit, window: window, entries: make(map[string]*rateWindow)}
	go rl.cleanup()
	return rl
}

// Allow registra una petición para la clave y devuelve si está permitida.
func (rl *RateLimiter) Allow(key string) bool {
	now := time.Now()
	rl.mu.Lock()
	defer rl.mu.Unlock()
	w, ok := rl.entries[key]
	if !ok || now.Sub(w.start) >= rl.window {
		rl.entries[key] = &rateWindow{start: now, count: 1}
		return true
	}
	if w.count >= rl.limit {
		return false
	}
	w.count++
	return true
}

// cleanup elimina periódicamente las ventanas expiradas para no crecer sin límite.
func (rl *RateLimiter) cleanup() {
	ticker := time.NewTicker(rl.window)
	defer ticker.Stop()
	for range ticker.C {
		now := time.Now()
		rl.mu.Lock()
		for key, w := range rl.entries {
			if now.Sub(w.start) >= rl.window {
				delete(rl.entries, key)
			}
		}
		rl.mu.Unlock()
	}
}

// Middleware devuelve un middleware de Gin que responde 429 al superar el límite.
func (rl *RateLimiter) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !rl.Allow(c.FullPath() + "|" + c.ClientIP()) {
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error": "Demasiadas peticiones, inténtalo de nuevo más tarde",
			})
			c.Abort()
			return
		}
		c.Next()
	}
}
