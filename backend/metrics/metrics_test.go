package metrics

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// gatherNames devuelve el conjunto de nombres de familia que expone un Gatherer.
func gatherNames(t *testing.T, gatherer prometheus.Gatherer) map[string]struct{} {
	t.Helper()
	families, err := gatherer.Gather()
	require.NoError(t, err)

	names := make(map[string]struct{}, len(families))
	for _, family := range families {
		names[family.GetName()] = struct{}{}
	}
	return names
}

func TestNewRegistry_IncludesGoAndProcessCollectors(t *testing.T) {
	names := gatherNames(t, NewRegistry())

	assert.Contains(t, names, "go_goroutines", "el colector de Go debe estar registrado")
	assert.Contains(t, names, "process_cpu_seconds_total", "el colector de proceso debe estar registrado")
}

func TestNew_RegistersBackendMetricDefinitions(t *testing.T) {
	m := New(prometheus.NewRegistry())

	// Materializamos un hijo de cada vec para que Gather exponga la familia.
	m.HTTPRequestsTotal.WithLabelValues("GET", "/healthz", "200")
	m.HTTPRequestDuration.WithLabelValues("GET", "/healthz")
	m.WSMessagesReceivedTotal.WithLabelValues("chat")
	m.MessagesSentTotal.WithLabelValues(KindDirect)
	m.MessagesFailedTotal.WithLabelValues(KindGroup)
	m.DependencyUp.WithLabelValues("postgres")

	names := gatherNames(t, m.Registry())
	want := []string{
		"http_requests_total",
		"http_request_duration_seconds",
		"http_requests_in_flight",
		"ws_connections_total",
		"ws_disconnects_total",
		"ws_messages_received_total",
		"ws_send_dropped_total",
		"messages_sent_total",
		"messages_failed_total",
		"dependency_up",
	}
	for _, name := range want {
		assert.Contains(t, names, name, "la métrica %q debe estar registrada", name)
	}
}

func TestNewRegistry_IsIsolatedFromDefault(t *testing.T) {
	registry := NewRegistry()

	// Un registry propio nunca es el global: registrarlo en el default debe ser posible.
	assert.NotSame(t, prometheus.DefaultRegisterer, prometheus.Registerer(registry))

	_, err := registry.Gather()
	require.NoError(t, err)
}

func TestMetrics_DoesNotTouchDefaultRegistry(t *testing.T) {
	m := New(NewRegistry())
	m.HTTPRequestsTotal.WithLabelValues("GET", "/healthz", "200").Inc()
	m.MessagesSentTotal.WithLabelValues(KindDirect).Inc()

	names := gatherNames(t, prometheus.DefaultGatherer)
	assert.NotContains(t, names, "http_requests_total")
	assert.NotContains(t, names, "messages_sent_total")
}

func TestMetrics_CountersAndGaugesRecord(t *testing.T) {
	m := New(prometheus.NewRegistry())

	m.HTTPRequestsTotal.WithLabelValues("GET", "/api/v1/x", "200").Inc()
	m.HTTPRequestsTotal.WithLabelValues("GET", "/api/v1/x", "200").Inc()
	m.HTTPRequestsInFlight.Inc()
	m.WSConnectionsTotal.Inc()
	m.WSDisconnectsTotal.Inc()
	m.WSMessagesReceivedTotal.WithLabelValues("chat").Inc()
	m.WSSendDroppedTotal.Inc()
	m.MessagesSentTotal.WithLabelValues(KindDirect).Inc()
	m.MessagesFailedTotal.WithLabelValues(KindGroup).Inc()
	m.DependencyUp.WithLabelValues("redis").Set(1)

	assert.Equal(t, 2.0, testutil.ToFloat64(m.HTTPRequestsTotal.WithLabelValues("GET", "/api/v1/x", "200")))
	assert.Equal(t, 1.0, testutil.ToFloat64(m.HTTPRequestsInFlight))
	assert.Equal(t, 1.0, testutil.ToFloat64(m.WSConnectionsTotal))
	assert.Equal(t, 1.0, testutil.ToFloat64(m.WSDisconnectsTotal))
	assert.Equal(t, 1.0, testutil.ToFloat64(m.WSMessagesReceivedTotal.WithLabelValues("chat")))
	assert.Equal(t, 1.0, testutil.ToFloat64(m.WSSendDroppedTotal))
	assert.Equal(t, 1.0, testutil.ToFloat64(m.MessagesSentTotal.WithLabelValues(KindDirect)))
	assert.Equal(t, 1.0, testutil.ToFloat64(m.MessagesFailedTotal.WithLabelValues(KindGroup)))
	assert.Equal(t, 1.0, testutil.ToFloat64(m.DependencyUp.WithLabelValues("redis")))
}

func TestMetrics_HistogramObservesAndBucketsBound(t *testing.T) {
	m := New(prometheus.NewRegistry())
	m.HTTPRequestDuration.WithLabelValues("GET", "/api/v1/x").Observe(0.02)

	assert.Equal(t, 1, testutil.CollectAndCount(m.HTTPRequestDuration, "http_request_duration_seconds"))

	names := gatherNames(t, m.Registry())
	require.Contains(t, names, "http_request_duration_seconds")
}

func TestMetrics_IsolatedRegistries(t *testing.T) {
	first := New(prometheus.NewRegistry())
	second := New(prometheus.NewRegistry())

	first.MessagesSentTotal.WithLabelValues(KindDirect).Inc()
	first.MessagesSentTotal.WithLabelValues(KindDirect).Inc()

	assert.Equal(t, 2.0, testutil.ToFloat64(first.MessagesSentTotal.WithLabelValues(KindDirect)))
	assert.Equal(t, 0.0, testutil.ToFloat64(second.MessagesSentTotal.WithLabelValues(KindDirect)))
}

func TestHandler_ServesRegistryInPrometheusFormat(t *testing.T) {
	server := httptest.NewServer(New(NewRegistry()).Handler())
	defer server.Close()

	resp, err := http.Get(server.URL)
	require.NoError(t, err)
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)

	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Contains(t, string(body), "go_goroutines")
	assert.Contains(t, string(body), "http_requests_in_flight")
}
