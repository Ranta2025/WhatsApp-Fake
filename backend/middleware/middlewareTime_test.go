package middleware

import (
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

// accessLogRecord ejecuta la cadena RequestID + TimeMiddleware y devuelve el
// record del access log y el recorder HTTP.
func accessLogRecord(t *testing.T, route, requestPath string, status int) (capturedRecord, *httptest.ResponseRecorder) {
	t.Helper()
	cap := captureSlog(t)

	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.ContextWithFallback = true
	engine.Use(RequestID(), TimeMiddleware())
	engine.GET(route, func(c *gin.Context) { c.Status(status) })

	w := httptest.NewRecorder()
	engine.ServeHTTP(w, httptest.NewRequest("GET", requestPath, nil))
	return cap.last(t), w
}

func TestAccessLogIncludesRequestIDAndContextFields(t *testing.T) {
	rec, w := accessLogRecord(t, "/api/thing/:id", "/api/thing/42", http.StatusOK)

	assert.Equal(t, "Request completed", rec.message)
	assert.Equal(t, "GET", rec.attrs["method"])
	assert.Equal(t, "/api/thing/42", rec.attrs["path"], "path conserva la ruta cruda por compatibilidad")
	assert.Equal(t, "200", rec.attrs["status"])
	assert.Equal(t, "/api/thing/:id", rec.attrs["route"], "route es la plantilla, sin ids")
	assert.NotEmpty(t, rec.attrs["client_ip"])
	assert.NotEmpty(t, rec.attrs["bytes"])

	// Campos heredados de TimeMiddleware: no se renombran.
	assert.Contains(t, rec.attrs, "duracion_ms")
	assert.Contains(t, rec.attrs, "duracion")

	// El id del log es el mismo que viaja al cliente.
	assert.Equal(t, w.Header().Get(requestIDHeader), rec.attrs["request_id"])
	assert.NotEmpty(t, rec.attrs["request_id"])
}

func TestAccessLogLevelByStatus(t *testing.T) {
	cases := []struct {
		name   string
		path   string
		status int
		want   slog.Level
	}{
		{"2xx info", "/ok", http.StatusOK, slog.LevelInfo},
		{"5xx error", "/fail", http.StatusInternalServerError, slog.LevelError},
		{"4xx warn", "/bad", http.StatusBadRequest, slog.LevelWarn},
		{"healthz debug", "/healthz", http.StatusOK, slog.LevelDebug},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec, _ := accessLogRecord(t, tc.path, tc.path, tc.status)
			assert.Equal(t, tc.want, rec.level)
		})
	}
}
