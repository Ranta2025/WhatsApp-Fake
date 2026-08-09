package websocket

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
)

// A9/R2: un upgrade WebSocket sin cabecera Origin debe ser rechazado.
func TestCheckOriginRejectsMissingOrigin(t *testing.T) {
	req := httptest.NewRequest("GET", "/ws", nil)
	req.Header.Del("Origin")

	assert.False(t, upgrader.CheckOrigin(req), "un upgrade sin Origin debe rechazarse (403)")
}

// R2: un Origin en la lista permitida pasa.
func TestCheckOriginAllowsConfiguredOrigin(t *testing.T) {
	req := httptest.NewRequest("GET", "/ws", nil)
	req.Header.Set("Origin", "http://localhost:5173")

	assert.True(t, upgrader.CheckOrigin(req))
}

// R2: un Origin desconocido se rechaza.
func TestCheckOriginRejectsUnknownOrigin(t *testing.T) {
	req := httptest.NewRequest("GET", "/ws", nil)
	req.Header.Set("Origin", "https://evil.example.com")

	assert.False(t, upgrader.CheckOrigin(req))
}

// R2: un Origin mal formado se rechaza.
func TestCheckOriginRejectsMalformedOrigin(t *testing.T) {
	req := httptest.NewRequest("GET", "/ws", nil)
	req.Header.Set("Origin", "not-a-url")

	assert.False(t, upgrader.CheckOrigin(req))
}
