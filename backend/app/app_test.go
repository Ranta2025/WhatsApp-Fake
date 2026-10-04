package app

import (
	"context"
	"errors"
	"gorm/backend/metrics"
	"gorm/backend/models"
	"gorm/backend/schemas"
	"net"
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

// fakeExpiryRunner observa las pasadas de messageExpiryLoop.
type fakeExpiryRunner struct {
	mu    sync.Mutex
	seq   []error
	next  int
	calls chan error
}

func (f *fakeExpiryRunner) RunOnce(ctx context.Context) error {
	f.mu.Lock()
	var err error
	if f.next < len(f.seq) {
		err = f.seq[f.next]
	}
	f.next++
	f.mu.Unlock()
	f.calls <- err
	return err
}

func TestMessageExpiryLoopRunsAtStartupThenPerTickSurvivesErrorsAndStopsOnCancel(t *testing.T) {
	const interval = 300 * time.Millisecond
	fake := &fakeExpiryRunner{
		seq:   []error{errors.New("db caída temporalmente")},
		calls: make(chan error, 10),
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go messageExpiryLoop(ctx, fake, interval)

	select {
	case err := <-fake.calls:
		assert.Error(t, err)
	case <-time.After(100 * time.Millisecond):
		t.Fatal("no ejecutó la expiración inicial al arrancar")
	}

	select {
	case err := <-fake.calls:
		assert.NoError(t, err)
	case <-time.After(interval + 200*time.Millisecond):
		t.Fatal("no ejecutó la expiración en el siguiente tick")
	}

	cancel()
	select {
	case <-fake.calls:
		t.Fatal("siguió llamando después de cancelar el contexto")
	case <-time.After(interval + 200*time.Millisecond):
	}
}

func TestMessageExpiryIntervalIsOneMinute(t *testing.T) {
	assert.Equal(t, time.Minute, messageExpiryInterval)
}

// ==================== OB4-dependency-health ====================

// runDependencyCheck refleja el resultado del chequeo en dependency_up y lo
// ejecuta con un timeout, para no colgar el checker si una dependencia no responde.
func TestRunDependencyCheckSetsGaugesWithTimeout(t *testing.T) {
	m := newTestMetrics()
	var timeout time.Duration
	check := func(ctx context.Context) (bool, bool) {
		if deadline, ok := ctx.Deadline(); ok {
			timeout = time.Until(deadline)
		}
		return false, true
	}

	runDependencyCheck(context.Background(), m, check, 2*time.Second)

	assert.Equal(t, 0.0, testutil.ToFloat64(m.DependencyUp.WithLabelValues("postgres")))
	assert.Equal(t, 1.0, testutil.ToFloat64(m.DependencyUp.WithLabelValues("redis")))
	assert.InDelta(t, 2.0, timeout.Seconds(), 0.5, "el chequeo debe correr con timeout")
}

// El checker corre una vez al arrancar (sin esperar el primer tick), sigue en
// cada tick y se detiene cuando se cancela el contexto.
func TestDependencyCheckLoopRunsAtStartupThenPerTickAndStopsOnCancel(t *testing.T) {
	m := newTestMetrics()
	calls := make(chan struct{}, 16)
	check := func(context.Context) (bool, bool) {
		calls <- struct{}{}
		return true, true
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go dependencyCheckLoop(ctx, m, check, 100*time.Millisecond, time.Second)

	select {
	case <-calls:
	case <-time.After(80 * time.Millisecond):
		t.Fatal("no ejecutó el chequeo inicial al arrancar")
	}

	select {
	case <-calls:
	case <-time.After(300 * time.Millisecond):
		t.Fatal("no ejecutó el chequeo en el siguiente tick")
	}

	cancel()
	for len(calls) > 0 {
		<-calls
	}
	select {
	case <-calls:
		t.Fatal("siguió chequeando después de cancelar el contexto")
	case <-time.After(250 * time.Millisecond):
	}
}

// ==================== OB6b: review warnings ====================

// Un panic en un handler debe contarse como HTTP 500 en http_requests_total y
// dejar el gauge in-flight en 0 (Metrics envuelve a Recovery).
func TestNewEngineCountsPanicAsHTTP500(t *testing.T) {
	gin.SetMode(gin.TestMode)
	m := newTestMetrics()
	engine, err := newEngine(m)
	require.NoError(t, err)
	engine.GET("/boom", func(*gin.Context) { panic("boom") })

	w := httptest.NewRecorder()
	engine.ServeHTTP(w, httptest.NewRequest("GET", "/boom", nil))

	assert.Equal(t, http.StatusInternalServerError, w.Code)
	assert.Equal(t, 1.0, testutil.ToFloat64(m.HTTPRequestsTotal.WithLabelValues("GET", "/boom", "500")))
	assert.Equal(t, 0.0, testutil.ToFloat64(m.HTTPRequestsInFlight))
}

// Si el listener de métricas falla, Run debe pasar por el mismo apagado ordenado
// (cancelar jobs y apagar el server principal) en vez de retornar de golpe.
func TestRunShutsDownMainServerWhenMetricsListenerFails(t *testing.T) {
	occupied, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	defer occupied.Close()

	free, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	mainAddr := free.Addr().String()
	free.Close()

	cleanupCancelled := make(chan struct{})
	a := &App{
		server:              &http.Server{Addr: mainAddr, Handler: http.NewServeMux()},
		metricsServer:       &http.Server{Addr: occupied.Addr().String(), Handler: http.NewServeMux()},
		cancelStatusCleanup: func() { close(cleanupCancelled) },
	}

	runErr := make(chan error, 1)
	go func() { runErr <- a.Run(context.Background()) }()

	select {
	case err := <-runErr:
		require.Error(t, err, "el fallo del listener debe propagarse")
	case <-time.After(3 * time.Second):
		t.Fatal("Run no retornó tras fallar el listener de métricas")
	}

	select {
	case <-cleanupCancelled:
	default:
		t.Fatal("no cancelaron los jobs de fondo en el apagado")
	}
	conn, dialErr := net.DialTimeout("tcp", mainAddr, 300*time.Millisecond)
	if dialErr == nil {
		conn.Close()
		t.Fatal("el server principal siguió escuchando tras el fallo del listener")
	}
}

// En el apagado, el despacho de Web Push se cierra (drena los envíos
// encolados) después de apagar el server HTTP, que ya no encola más.
func TestRunClosesPushNotifierAfterServerShutdown(t *testing.T) {
	free, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	mainAddr := free.Addr().String()
	free.Close()

	closed := make(chan bool, 1)
	hadDeadline := make(chan bool, 1)
	a := &App{
		server: &http.Server{Addr: mainAddr, Handler: http.NewServeMux()},
		closePush: func(ctx context.Context) error {
			_, ok := ctx.Deadline()
			hadDeadline <- ok
			conn, dialErr := net.DialTimeout("tcp", mainAddr, 300*time.Millisecond)
			if dialErr == nil {
				conn.Close()
			}
			closed <- dialErr != nil
			return nil
		},
	}

	ctx, cancel := context.WithCancel(context.Background())
	runErr := make(chan error, 1)
	go func() { runErr <- a.Run(ctx) }()
	require.Eventually(t, func() bool {
		conn, err := net.DialTimeout("tcp", mainAddr, 100*time.Millisecond)
		if err == nil {
			conn.Close()
		}
		return err == nil
	}, 3*time.Second, 20*time.Millisecond)
	cancel()

	select {
	case err := <-runErr:
		require.NoError(t, err)
	case <-time.After(3 * time.Second):
		t.Fatal("Run no retornó tras cancelar el contexto")
	}
	select {
	case serverDown := <-closed:
		assert.True(t, serverDown, "el despacho se cierra después de apagar el server")
	default:
		t.Fatal("no se cerró el despacho de push en el apagado")
	}
	assert.True(t, <-hadDeadline, "el cierre del despacho usa el plazo del apagado")
}
