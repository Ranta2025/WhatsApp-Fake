package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

// G1: las 4 cabeceras de seguridad deben estar presentes en TODA respuesta,
// tanto éxito como error.
func TestSecurityHeadersPresentOnAllResponses(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(SecurityHeaders())
	r.GET("/ok", func(c *gin.Context) { c.String(http.StatusOK, "fine") })
	r.GET("/fail", func(c *gin.Context) { c.AbortWithStatus(http.StatusInternalServerError) })

	for _, path := range []string{"/ok", "/fail"} {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest("GET", path, nil))

		csp := w.Header().Get("Content-Security-Policy")
		assert.NotEmpty(t, csp, "%s: CSP requerida", path)
		assert.Contains(t, csp, "default-src 'self'")

		assert.Equal(t, "max-age=31536000; includeSubDomains", w.Header().Get("Strict-Transport-Security"), path)
		assert.Equal(t, "DENY", w.Header().Get("X-Frame-Options"), path)
		assert.Equal(t, "nosniff", w.Header().Get("X-Content-Type-Options"), path)
	}
}
