package config

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestIsAllowedOrigin(t *testing.T) {
	cases := map[string]bool{
		"http://localhost:5173":           true,
		"https://abc.ngrok-free.app":      true,
		"https://abc.ngrok-free.dev":      true,
		"https://foo.trycloudflare.com":   true,
		"https://evilngrok-free.dev":      false,
		"https://ngrok-free.app.evil.com": false,
		"https://eviltrycloudflare.com":   false,
		"http://localhost:3000":           false,
		"":                                false,
	}
	for origin, want := range cases {
		if got := IsAllowedOrigin(origin); got != want {
			t.Errorf("IsAllowedOrigin(%q) = %v, want %v", origin, got, want)
		}
	}
}

// X-Has-More lo lee el frontend cross-origin en la paginación del chat 1:1.
func TestCorsExposesHasMoreHeader(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(Cors())
	r.GET("/x", func(c *gin.Context) { c.Status(http.StatusOK) })

	req := httptest.NewRequest("GET", "/x", nil)
	req.Header.Set("Origin", "http://localhost:5173")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if got := w.Header().Get("Access-Control-Expose-Headers"); !strings.Contains(got, "X-Has-More") {
		t.Errorf("Access-Control-Expose-Headers = %q, want X-Has-More", got)
	}
}
