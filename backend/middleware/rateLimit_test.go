package middleware

import (
	"testing"
	"time"
)

func TestRateLimiterAllow(t *testing.T) {
	rl := NewRateLimiter(2, time.Hour)
	if !rl.Allow("a") || !rl.Allow("a") {
		t.Fatal("las dos primeras peticiones deberían permitirse")
	}
	if rl.Allow("a") {
		t.Fatal("la tercera petición debería bloquearse")
	}
	if !rl.Allow("b") {
		t.Fatal("otra clave no debería verse afectada")
	}
}
