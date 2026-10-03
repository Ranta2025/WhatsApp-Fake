package metrics

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/testutil"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// stubConnector/stubDriver permiten abrir un *sql.DB sin conexión real: el
// colector de pool solo llama a db.Stats(), así que alcanza para los tests.
type stubConnector struct{}

func (stubConnector) Connect(context.Context) (driver.Conn, error) {
	return nil, errors.New("stub: sin conexión real")
}

func (stubConnector) Driver() driver.Driver { return stubDriver{} }

type stubDriver struct{}

func (stubDriver) Open(string) (driver.Conn, error) {
	return nil, errors.New("stub: sin conexión real")
}

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

	// Layout de buckets: 12 límites exponenciales desde 5ms (x2), hasta 10.24s.
	families, err := m.Registry().Gather()
	require.NoError(t, err)
	var bounds []float64
	for _, family := range families {
		if family.GetName() != "http_request_duration_seconds" {
			continue
		}
		for _, b := range family.GetMetric()[0].GetHistogram().GetBucket() {
			bounds = append(bounds, b.GetUpperBound())
		}
	}
	want := prometheus.ExponentialBuckets(0.005, 2, 12)
	require.Len(t, bounds, 12)
	assert.InDeltaSlice(t, want, bounds, 1e-9)
	assert.InDelta(t, 0.005, bounds[0], 1e-9)
	assert.InDelta(t, 10.24, bounds[len(bounds)-1], 1e-9)
}

func TestMetrics_IsolatedRegistries(t *testing.T) {
	first := New(prometheus.NewRegistry())
	second := New(prometheus.NewRegistry())

	first.MessagesSentTotal.WithLabelValues(KindDirect).Inc()
	first.MessagesSentTotal.WithLabelValues(KindDirect).Inc()

	// Solo el registry de first tiene la serie; el de second no la ve (no se
	// crea ninguna serie en second al consultar, a diferencia de ToFloat64 sobre
	// WithLabelValues, que la crearía en 0 y no probaría nada).
	assert.Equal(t, 2.0, sampleValue(t, first.Registry(), "messages_sent_total", "kind", KindDirect))
	assert.NotContains(t, gatherNames(t, second.Registry()), "messages_sent_total")
}

// sampleValue devuelve el valor de un counter/gauge con un label dado, o -1 si
// la serie no existe en el registry.
func sampleValue(t *testing.T, gatherer prometheus.Gatherer, name, label, value string) float64 {
	t.Helper()
	families, err := gatherer.Gather()
	require.NoError(t, err)
	for _, family := range families {
		if family.GetName() != name {
			continue
		}
		for _, metric := range family.GetMetric() {
			for _, l := range metric.GetLabel() {
				if l.GetName() == label && l.GetValue() == value {
					if c := metric.GetCounter(); c != nil {
						return c.GetValue()
					}
					return metric.GetGauge().GetValue()
				}
			}
		}
	}
	return -1
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

// ==================== OB4 ====================

func TestRegisterHubStatsExposesCollectionGauges(t *testing.T) {
	m := New(prometheus.NewRegistry())
	stats := HubStats{Connections: 3, Rooms: 2, RoomMemberships: 5}
	require.NoError(t, m.RegisterHubStats(func() HubStats { return stats }))

	assert.Equal(t, 3.0, testutil.ToFloat64(m.WSConnections))
	assert.Equal(t, 2.0, testutil.ToFloat64(m.WSRooms))
	assert.Equal(t, 5.0, testutil.ToFloat64(m.WSRoomMemberships))

	names := gatherNames(t, m.Registry())
	for _, name := range []string{"ws_connections", "ws_rooms", "ws_room_memberships"} {
		assert.Contains(t, names, name)
	}
}

func TestRegisterDBStatsExposesSQLPool(t *testing.T) {
	m := New(prometheus.NewRegistry())
	db := sql.OpenDB(stubConnector{})
	defer db.Close()

	require.NoError(t, m.RegisterDBStats(db, "postgres"))

	names := gatherNames(t, m.Registry())
	assert.Contains(t, names, "go_sql_max_open_connections")
	assert.Contains(t, names, "go_sql_open_connections")
}

func TestRegisterRedisPoolStatsExposesPoolGauges(t *testing.T) {
	m := New(prometheus.NewRegistry())
	stats := &redis.PoolStats{Hits: 4, Misses: 1, Timeouts: 2, TotalConns: 7, IdleConns: 3, StaleConns: 1}
	require.NoError(t, m.RegisterRedisPoolStats(func() *redis.PoolStats { return stats }))

	assert.Equal(t, 4.0, testutil.ToFloat64(m.RedisPoolHits))
	assert.Equal(t, 1.0, testutil.ToFloat64(m.RedisPoolMisses))
	assert.Equal(t, 2.0, testutil.ToFloat64(m.RedisPoolTimeouts))
	assert.Equal(t, 7.0, testutil.ToFloat64(m.RedisPoolTotalConns))
	assert.Equal(t, 3.0, testutil.ToFloat64(m.RedisPoolIdleConns))
	assert.Equal(t, 1.0, testutil.ToFloat64(m.RedisPoolStaleConns))

	names := gatherNames(t, m.Registry())
	for _, name := range []string{
		"redis_pool_hits", "redis_pool_misses", "redis_pool_timeouts",
		"redis_pool_total_conns", "redis_pool_idle_conns", "redis_pool_stale_conns",
	} {
		assert.Contains(t, names, name)
	}
}

func TestMessageHelpersIncrementCounters(t *testing.T) {
	m := New(prometheus.NewRegistry())
	m.MessageSent(KindDirect)
	m.MessageSent(KindDirect)
	m.MessageSent(KindGroup)
	m.MessageFailed(KindGroup)

	assert.Equal(t, 2.0, testutil.ToFloat64(m.MessagesSentTotal.WithLabelValues(KindDirect)))
	assert.Equal(t, 1.0, testutil.ToFloat64(m.MessagesSentTotal.WithLabelValues(KindGroup)))
	assert.Equal(t, 1.0, testutil.ToFloat64(m.MessagesFailedTotal.WithLabelValues(KindGroup)))
}

func TestSetDependencyUp(t *testing.T) {
	m := New(prometheus.NewRegistry())
	m.SetDependencyUp("postgres", false)
	m.SetDependencyUp("redis", true)

	assert.Equal(t, 0.0, testutil.ToFloat64(m.DependencyUp.WithLabelValues("postgres")))
	assert.Equal(t, 1.0, testutil.ToFloat64(m.DependencyUp.WithLabelValues("redis")))
}

func TestMessageExpiryMetrics(t *testing.T) {
	m := New(prometheus.NewRegistry())

	m.MessagesExpired(KindDirect, 3)
	m.MessagesExpired(KindGroup, 2)
	m.MessagesExpired(KindGroup, 0)
	for _, r := range []string{MediaGCOK, MediaGCOK, MediaGCFailed, MediaGCGaveUp, MediaGCSkippedReferenced} {
		m.MediaGCResult(r)
	}
	m.SetMediaGCPending(4)

	assert.Equal(t, 3.0, testutil.ToFloat64(m.MessagesExpiredTotal.WithLabelValues(KindDirect)))
	assert.Equal(t, 2.0, testutil.ToFloat64(m.MessagesExpiredTotal.WithLabelValues(KindGroup)))
	assert.Equal(t, 2.0, testutil.ToFloat64(m.MediaGCDeletionsTotal.WithLabelValues("ok")))
	assert.Equal(t, 1.0, testutil.ToFloat64(m.MediaGCDeletionsTotal.WithLabelValues("failed")))
	assert.Equal(t, 1.0, testutil.ToFloat64(m.MediaGCDeletionsTotal.WithLabelValues("gave_up")))
	assert.Equal(t, 1.0, testutil.ToFloat64(m.MediaGCDeletionsTotal.WithLabelValues("skipped_referenced")))
	assert.Equal(t, 4.0, testutil.ToFloat64(m.MediaGCPending))

	names := gatherNames(t, m.Registry())
	for _, n := range []string{"messages_expired_total", "media_gc_deletions_total", "media_gc_pending"} {
		assert.Contains(t, names, n)
	}
}
