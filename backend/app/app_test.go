package app

import (
	"context"
	"errors"
	"gorm/backend/metrics"
	"gorm/backend/models"
	"gorm/backend/schemas"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeStatusService implementa services.StatusServicer solo para poder
// observar las llamadas a CleanupExpiredStatuses desde statusCleanupLoop;
// el resto de métodos no se ejercitan en estos tests.
type fakeStatusService struct {
	mu    sync.Mutex
	seq   []error
	next  int
	calls chan error
}

func (f *fakeStatusService) CleanupExpiredStatuses(ctx context.Context) (int64, error) {
	f.mu.Lock()
	var err error
	if f.next < len(f.seq) {
		err = f.seq[f.next]
	}
	f.next++
	f.mu.Unlock()

	f.calls <- err
	if err != nil {
		return 0, err
	}
	return 1, nil
}

func (f *fakeStatusService) CreateStatus(telephon string, input models.StatusCreate, ctx context.Context) (schemas.StatusItem, schemas.StatusOwnerBrief, []string, error) {
	return schemas.StatusItem{}, schemas.StatusOwnerBrief{}, nil, nil
}
func (f *fakeStatusService) GetFeed(telephon string, ctx context.Context) (schemas.StatusFeed, error) {
	return schemas.StatusFeed{}, nil
}
func (f *fakeStatusService) MarkStatusViewed(telephon string, statusID uint, ctx context.Context) (bool, string, schemas.StatusViewer, int64, error) {
	return false, "", schemas.StatusViewer{}, 0, nil
}
func (f *fakeStatusService) GetStatusViewers(telephon string, statusID uint, ctx context.Context) ([]schemas.StatusViewer, error) {
	return nil, nil
}
func (f *fakeStatusService) DeleteStatus(telephon string, statusID uint, ctx context.Context) ([]string, error) {
	return nil, nil
}

// ==================== OB2-request-id-middleware-order ====================

// La cadena de newEngine debe devolver X-Request-ID en toda respuesta y seguir
// resolviendo el preflight CORS pese a que RequestID/Recovery van antes de Cors.
func TestNewEngineSetsRequestIDAndKeepsCorsPreflight(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine, err := newEngine(newTestMetrics())
	require.NoError(t, err)

	w := httptest.NewRecorder()
	engine.ServeHTTP(w, httptest.NewRequest("GET", "/", nil))
	assert.NotEmpty(t, w.Header().Get("X-Request-ID"), "toda respuesta debe llevar X-Request-ID")

	pre := httptest.NewRequest("OPTIONS", "/", nil)
	pre.Header.Set("Origin", "http://localhost:5173")
	pre.Header.Set("Access-Control-Request-Method", "GET")
	pw := httptest.NewRecorder()
	engine.ServeHTTP(pw, pre)

	assert.Equal(t, http.StatusNoContent, pw.Code, "el preflight CORS no debe romperse con el nuevo orden")
	assert.Equal(t, "http://localhost:5173", pw.Header().Get("Access-Control-Allow-Origin"))
	assert.NotEmpty(t, pw.Header().Get("X-Request-ID"), "el preflight también lleva el id")
}

// ==================== OB3-metrics ====================

// newTestMetrics devuelve métricas con un registry aislado para los tests.
func newTestMetrics() *metrics.Metrics {
	return metrics.New(metrics.NewRegistry())
}

// newEngine debe insertar el middleware Metrics: una petición queda registrada.
func TestNewEngineRecordsHTTPMetrics(t *testing.T) {
	gin.SetMode(gin.TestMode)
	m := newTestMetrics()
	engine, err := newEngine(m)
	require.NoError(t, err)

	w := httptest.NewRecorder()
	engine.ServeHTTP(w, httptest.NewRequest("GET", "/", nil))

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, 1.0, testutil.ToFloat64(m.HTTPRequestsTotal.WithLabelValues("GET", "/", "200")))
}

// El listener de métricas sirve /metrics y responde 404 en cualquier otra ruta
// (nunca la SPA ni la API).
func TestMetricsHandlerServesMetricsOnly(t *testing.T) {
	handler := metricsHandler(newTestMetrics())

	t.Run("sirve /metrics", func(t *testing.T) {
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, httptest.NewRequest("GET", "/metrics", nil))

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Contains(t, w.Body.String(), "http_requests_in_flight")
	})

	for _, path := range []string{"/", "/metrics/", "/healthz", "/api/v1/ws"} {
		t.Run("404 "+path, func(t *testing.T) {
			w := httptest.NewRecorder()
			handler.ServeHTTP(w, httptest.NewRequest("GET", path, nil))

			assert.Equal(t, http.StatusNotFound, w.Code)
		})
	}
}

// METRICS_ADDR vacío deshabilita el listener (runs sin compose); con dirección
// se construye el segundo server.
func TestNewMetricsServerDisabledWhenAddrEmpty(t *testing.T) {
	m := newTestMetrics()

	assert.Nil(t, newMetricsServer("", m), "sin METRICS_ADDR no hay listener de métricas")

	srv := newMetricsServer("127.0.0.1:9090", m)
	require.NotNil(t, srv)
	assert.Equal(t, "127.0.0.1:9090", srv.Addr)
	assert.NotNil(t, srv.Handler)
}

// ==================== R3-cleanup-loop-untested ====================

func TestStatusCleanupLoopRunsAtStartupThenPerTickSurvivesErrorsAndStopsOnCancel(t *testing.T) {
	const interval = 300 * time.Millisecond
	fake := &fakeStatusService{
		seq:   []error{errors.New("db caída temporalmente")}, // solo la 1ra llamada falla
		calls: make(chan error, 10),
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go statusCleanupLoop(ctx, fake, interval)

	// 1) corre una limpieza inmediata al arrancar, sin esperar al primer tick,
	// y sobrevive al error que devuelve esa primera llamada.
	select {
	case err := <-fake.calls:
		assert.Error(t, err)
	case <-time.After(100 * time.Millisecond):
		t.Fatal("no ejecutó la limpieza inicial al arrancar")
	}

	// 2) sigue llamando en cada tick (la 2da llamada, ya sin error).
	select {
	case err := <-fake.calls:
		assert.NoError(t, err)
	case <-time.After(interval + 200*time.Millisecond):
		t.Fatal("no ejecutó la limpieza en el siguiente tick")
	}

	// 3) se detiene al cancelar el contexto: no debe haber más llamadas.
	cancel()
	select {
	case <-fake.calls:
		t.Fatal("siguió llamando después de cancelar el contexto")
	case <-time.After(interval + 200*time.Millisecond):
	}
}
