package middleware

import (
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestRecoveryReturnsJSON500AndLogsPanicWithRequestID(t *testing.T) {
	cap := captureSlog(t)

	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.ContextWithFallback = true
	engine.Use(RequestID(), Recovery())
	engine.GET("/boom", func(*gin.Context) { panic("kaboom") })

	w := httptest.NewRecorder()
	engine.ServeHTTP(w, httptest.NewRequest("GET", "/boom", nil))

	assert.Equal(t, http.StatusInternalServerError, w.Code)
	assert.JSONEq(t, `{"error":"error interno del servidor"}`, w.Body.String(),
		"el recovery debe conservar la forma JSON de error de la API")

	rec := cap.last(t)
	assert.Equal(t, slog.LevelError, rec.level)
	assert.Contains(t, rec.attrs["panic"], "kaboom")
	assert.NotEmpty(t, rec.attrs["stack"], "el stack del panic debe quedar en el log")
	assert.Equal(t, w.Header().Get(requestIDHeader), rec.attrs["request_id"],
		"el request id del log debe ser el mismo que viaja al cliente")
}
