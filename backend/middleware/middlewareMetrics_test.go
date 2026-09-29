package middleware

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"gorm/backend/metrics"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/testutil"
	"github.com/stretchr/testify/assert"
)

// newMetricsEngine crea un engine con el middleware Metrics y las rutas que
// registre el callback, para aislar el comportamiento del middleware.
func newMetricsEngine(m *metrics.Metrics, register func(*gin.Engine)) *gin.Engine {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.Use(Metrics(m))
	register(engine)
	return engine
}

// El label route debe ser la plantilla (c.FullPath()), nunca la ruta cruda con
// ids: si no, cada id generaría una serie distinta.
func TestMetricsUsesRouteTemplateNotRawPath(t *testing.T) {
	m := metrics.New(prometheus.NewRegistry())
	engine := newMetricsEngine(m, func(e *gin.Engine) {
		e.GET("/api/thing/:id", func(c *gin.Context) { c.Status(http.StatusOK) })
	})

	engine.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", "/api/thing/42", nil))

	assert.Equal(t, 1.0, testutil.ToFloat64(m.HTTPRequestsTotal.WithLabelValues("GET", "/api/thing/:id", "200")),
		"la serie debe etiquetarse con la plantilla de ruta")
	assert.Equal(t, 0.0, testutil.ToFloat64(m.HTTPRequestsTotal.WithLabelValues("GET", "/api/thing/42", "200")),
		"no debe existir una serie con la ruta cruda")
}

// Cualquier ruta no registrada colapsa en una sola serie route="unmatched".
func TestMetricsCollapsesUnmatchedPathsToOneSeries(t *testing.T) {
	m := metrics.New(prometheus.NewRegistry())
	engine := newMetricsEngine(m, func(*gin.Engine) {})

	const requests = 1000
	for i := 0; i < requests; i++ {
		w := httptest.NewRecorder()
		engine.ServeHTTP(w, httptest.NewRequest("GET", fmt.Sprintf("/missing/%d", i), nil))
		assert.Equal(t, http.StatusNotFound, w.Code)
	}

	assert.Equal(t, float64(requests), testutil.ToFloat64(m.HTTPRequestsTotal.WithLabelValues("GET", "unmatched", "404")))
	assert.Equal(t, 1, testutil.CollectAndCount(m.HTTPRequestsTotal, "http_requests_total"),
		"1000 rutas distintas deben producir una sola serie")
}

// El WebSocket (larga vida) y /healthz (sondeo continuo) cuentan en el total
// pero no ensucian el histograma de duración.
func TestMetricsExcludesWSAndHealthzFromDurationHistogram(t *testing.T) {
	cases := []struct {
		name  string
		route string
	}{
		{"websocket", "/api/v1/ws"},
		{"healthz", "/healthz"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			m := metrics.New(prometheus.NewRegistry())
			engine := newMetricsEngine(m, func(e *gin.Engine) {
				e.GET(tc.route, func(c *gin.Context) { c.Status(http.StatusOK) })
			})

			engine.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", tc.route, nil))

			assert.Equal(t, 1.0, testutil.ToFloat64(m.HTTPRequestsTotal.WithLabelValues("GET", tc.route, "200")))
			assert.Equal(t, 0, testutil.CollectAndCount(m.HTTPRequestDuration, "http_request_duration_seconds"),
				"la ruta %s no debe observarse en el histograma de duración", tc.route)
		})
	}
}

// Una ruta normal sí alimenta el histograma de duración.
func TestMetricsObservesDurationForNormalRoutes(t *testing.T) {
	m := metrics.New(prometheus.NewRegistry())
	engine := newMetricsEngine(m, func(e *gin.Engine) {
		e.GET("/api/thing/:id", func(c *gin.Context) { c.Status(http.StatusOK) })
	})

	engine.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", "/api/thing/7", nil))

	assert.Equal(t, 1, testutil.CollectAndCount(m.HTTPRequestDuration, "http_request_duration_seconds"))
}

// El gauge in-flight sube durante el handler y vuelve a cero al terminar.
func TestMetricsInFlightTracksRequests(t *testing.T) {
	m := metrics.New(prometheus.NewRegistry())
	engine := newMetricsEngine(m, func(e *gin.Engine) {
		e.GET("/x", func(c *gin.Context) {
			assert.Equal(t, 1.0, testutil.ToFloat64(m.HTTPRequestsInFlight), "en vuelo = 1 dentro del handler")
			c.Status(http.StatusOK)
		})
	})

	engine.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", "/x", nil))

	assert.Equal(t, 0.0, testutil.ToFloat64(m.HTTPRequestsInFlight), "en vuelo vuelve a 0 al terminar")
}
