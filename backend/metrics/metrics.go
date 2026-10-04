// Package metrics define la superficie de métricas Prometheus del backend y
// construye su registry aislado. No usa el registry global: cada constructor
// recibe el registry para que los tests puedan crear instancias independientes.
package metrics

import (
	"database/sql"
	"net/http"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/redis/go-redis/v9"
)

// Tipos de mensaje que etiquetan messages_sent_total y messages_failed_total.
const (
	KindDirect = "direct"
	KindGroup  = "group"
)

// Resultados de media_gc_deletions_total (cola de borrado de objetos de MinIO).
const (
	MediaGCOK                = "ok"
	MediaGCFailed            = "failed"
	MediaGCGaveUp            = "gave_up"
	MediaGCSkippedReferenced = "skipped_referenced"
)

// HubStats es una foto consistente de las colecciones del Hub WebSocket.
// La devuelve Hub.Stats() y la leen los gauges ws_connections / ws_rooms /
// ws_room_memberships en cada scrape, sin instrumentar los hot paths.
type HubStats struct {
	Connections     int
	Rooms           int
	RoomMemberships int
}

// httpDurationBuckets cubre desde 5ms hasta ~10.24s.
var httpDurationBuckets = prometheus.ExponentialBuckets(0.005, 2, 12)

// Metrics agrupa las definiciones de métricas del backend junto con su registry.
type Metrics struct {
	registry *prometheus.Registry

	HTTPRequestsTotal    *prometheus.CounterVec
	HTTPRequestDuration  *prometheus.HistogramVec
	HTTPRequestsInFlight prometheus.Gauge

	WSConnectionsTotal      prometheus.Counter
	WSDisconnectsTotal      prometheus.Counter
	WSMessagesReceivedTotal *prometheus.CounterVec
	WSSendDroppedTotal      prometheus.Counter

	// Gauges leídos del Hub en cada scrape (RegisterHubStats).
	WSConnections     prometheus.GaugeFunc
	WSRooms           prometheus.GaugeFunc
	WSRoomMemberships prometheus.GaugeFunc

	// Gauges leídos del pool de Redis en cada scrape (RegisterRedisPoolStats).
	RedisPoolHits       prometheus.GaugeFunc
	RedisPoolMisses     prometheus.GaugeFunc
	RedisPoolTimeouts   prometheus.GaugeFunc
	RedisPoolTotalConns prometheus.GaugeFunc
	RedisPoolIdleConns  prometheus.GaugeFunc
	RedisPoolStaleConns prometheus.GaugeFunc

	MessagesSentTotal   *prometheus.CounterVec
	MessagesFailedTotal *prometheus.CounterVec

	DependencyUp *prometheus.GaugeVec

	// Job de expiración de mensajes temporales y cola media_gc.
	MessagesExpiredTotal  *prometheus.CounterVec
	MediaGCDeletionsTotal *prometheus.CounterVec
	MediaGCPending        prometheus.Gauge
}

// NewRegistry construye un registry aislado con los colectores de Go y de
// proceso. No toca el registry global, así los tests pueden crear instancias
// independientes sin contaminarse entre sí.
func NewRegistry() *prometheus.Registry {
	registry := prometheus.NewRegistry()
	registry.MustRegister(
		collectors.NewGoCollector(),
		collectors.NewProcessCollector(collectors.ProcessCollectorOpts{}),
	)
	return registry
}

// New registra todas las definiciones de métricas del backend en registry y
// devuelve el conjunto listo para instrumentar.
func New(registry *prometheus.Registry) *Metrics {
	m := &Metrics{registry: registry}

	m.HTTPRequestsTotal = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "http_requests_total",
		Help: "Total de requests HTTP procesados, por método, plantilla de ruta y estado.",
	}, []string{"method", "route", "status"})

	m.HTTPRequestDuration = prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "http_request_duration_seconds",
		Help:    "Duración de los requests HTTP en segundos, por método y plantilla de ruta.",
		Buckets: httpDurationBuckets,
	}, []string{"method", "route"})

	m.HTTPRequestsInFlight = prometheus.NewGauge(prometheus.GaugeOpts{
		Name: "http_requests_in_flight",
		Help: "Requests HTTP que se están procesando ahora mismo.",
	})

	m.WSConnectionsTotal = prometheus.NewCounter(prometheus.CounterOpts{
		Name: "ws_connections_total",
		Help: "Total de conexiones WebSocket establecidas.",
	})

	m.WSDisconnectsTotal = prometheus.NewCounter(prometheus.CounterOpts{
		Name: "ws_disconnects_total",
		Help: "Total de desconexiones WebSocket.",
	})

	m.WSMessagesReceivedTotal = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "ws_messages_received_total",
		Help: "Total de mensajes WebSocket recibidos, por tipo.",
	}, []string{"type"})

	m.WSSendDroppedTotal = prometheus.NewCounter(prometheus.CounterOpts{
		Name: "ws_send_dropped_total",
		Help: "Total de envíos WebSocket descartados por buffer lleno.",
	})

	m.MessagesSentTotal = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "messages_sent_total",
		Help: "Total de mensajes persistidos correctamente, por tipo (direct|group).",
	}, []string{"kind"})

	m.MessagesFailedTotal = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "messages_failed_total",
		Help: "Total de mensajes que fallaron al persistir, por tipo (direct|group).",
	}, []string{"kind"})

	m.DependencyUp = prometheus.NewGaugeVec(prometheus.GaugeOpts{
		Name: "dependency_up",
		Help: "Disponibilidad de una dependencia externa (1 disponible, 0 caída).",
	}, []string{"dependency"})

	m.MessagesExpiredTotal = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "messages_expired_total",
		Help: "Total de mensajes temporales borrados por expiración, por tipo (direct|group).",
	}, []string{"kind"})

	m.MediaGCDeletionsTotal = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "media_gc_deletions_total",
		Help: "Intentos de borrado de objetos de la cola media_gc, por resultado (ok|failed|gave_up|skipped_referenced).",
	}, []string{"result"})

	m.MediaGCPending = prometheus.NewGauge(prometheus.GaugeOpts{
		Name: "media_gc_pending",
		Help: "Objetos pendientes en la cola media_gc al final de la última pasada.",
	})

	registry.MustRegister(
		m.HTTPRequestsTotal,
		m.HTTPRequestDuration,
		m.HTTPRequestsInFlight,
		m.WSConnectionsTotal,
		m.WSDisconnectsTotal,
		m.WSMessagesReceivedTotal,
		m.WSSendDroppedTotal,
		m.MessagesSentTotal,
		m.MessagesFailedTotal,
		m.DependencyUp,
		m.MessagesExpiredTotal,
		m.MediaGCDeletionsTotal,
		m.MediaGCPending,
	)

	return m
}

// Registry devuelve el registry subyacente que agrupa estas métricas.
func (m *Metrics) Registry() *prometheus.Registry { return m.registry }

// Handler expone el registry en el formato de texto de Prometheus.
func (m *Metrics) Handler() http.Handler {
	return promhttp.HandlerFor(m.registry, promhttp.HandlerOpts{})
}

// MessageSent cuenta un mensaje persistido correctamente. Es la puerta que usan
// los handlers (WS y REST) para no importar prometheus directamente.
func (m *Metrics) MessageSent(kind string) {
	m.MessagesSentTotal.WithLabelValues(kind).Inc()
}

// MessageFailed cuenta un mensaje que no pudo persistirse.
func (m *Metrics) MessageFailed(kind string) {
	m.MessagesFailedTotal.WithLabelValues(kind).Inc()
}

// WSMessageReceived cuenta un mensaje WebSocket recibido. El llamador debe
// pasar una etiqueta ya acotada (un tipo conocido o "unknown").
func (m *Metrics) WSMessageReceived(msgType string) {
	m.WSMessagesReceivedTotal.WithLabelValues(msgType).Inc()
}

// MessagesExpired suma n mensajes borrados por expiración del tipo indicado.
func (m *Metrics) MessagesExpired(kind string, n int) {
	if n > 0 {
		m.MessagesExpiredTotal.WithLabelValues(kind).Add(float64(n))
	}
}

// MediaGCResult cuenta un intento de borrado de la cola media_gc. El llamador
// pasa una de las constantes MediaGC*.
func (m *Metrics) MediaGCResult(result string) {
	m.MediaGCDeletionsTotal.WithLabelValues(result).Inc()
}

// SetMediaGCPending refleja cuántos objetos quedan en la cola media_gc.
func (m *Metrics) SetMediaGCPending(n int64) {
	m.MediaGCPending.Set(float64(n))
}

// SetDependencyUp refleja la disponibilidad de una dependencia externa.
func (m *Metrics) SetDependencyUp(dependency string, up bool) {
	value := 0.0
	if up {
		value = 1
	}
	m.DependencyUp.WithLabelValues(dependency).Set(value)
}

// RegisterHubStats registra los gauges ws_connections, ws_rooms y
// ws_room_memberships, que leen stats() en cada scrape (sin tocar el Hub en
// caliente). Devuelve el error de registro para no fallar en silencio.
func (m *Metrics) RegisterHubStats(stats func() HubStats) error {
	m.WSConnections = prometheus.NewGaugeFunc(prometheus.GaugeOpts{
		Name: "ws_connections",
		Help: "Conexiones WebSocket activas.",
	}, func() float64 { return float64(stats().Connections) })

	m.WSRooms = prometheus.NewGaugeFunc(prometheus.GaugeOpts{
		Name: "ws_rooms",
		Help: "Rooms de grupo con al menos un miembro conectado.",
	}, func() float64 { return float64(stats().Rooms) })

	m.WSRoomMemberships = prometheus.NewGaugeFunc(prometheus.GaugeOpts{
		Name: "ws_room_memberships",
		Help: "Membresías totales (conexiones por room) del Hub WebSocket.",
	}, func() float64 { return float64(stats().RoomMemberships) })

	return m.registerAll(m.WSConnections, m.WSRooms, m.WSRoomMemberships)
}

// RegisterDBStats registra el colector de pool de database/sql con la etiqueta
// db_name indicada (p. ej. "postgres").
func (m *Metrics) RegisterDBStats(db *sql.DB, name string) error {
	return m.registry.Register(collectors.NewDBStatsCollector(db, name))
}

// RegisterRedisPoolStats registra gauges del pool de conexiones de Redis. Se
// leen de stats() en cada scrape: sin instrumentación en los hot paths.
func (m *Metrics) RegisterRedisPoolStats(stats func() *redis.PoolStats) error {
	specs := []struct {
		opts prometheus.GaugeOpts
		get  func(*redis.PoolStats) float64
	}{
		{prometheus.GaugeOpts{Name: "redis_pool_hits", Help: "Conexiones reutilizadas del pool de Redis."}, func(s *redis.PoolStats) float64 { return float64(s.Hits) }},
		{prometheus.GaugeOpts{Name: "redis_pool_misses", Help: "Veces que no hubo conexión libre en el pool de Redis."}, func(s *redis.PoolStats) float64 { return float64(s.Misses) }},
		{prometheus.GaugeOpts{Name: "redis_pool_timeouts", Help: "Timeouts esperando una conexión del pool de Redis."}, func(s *redis.PoolStats) float64 { return float64(s.Timeouts) }},
		{prometheus.GaugeOpts{Name: "redis_pool_total_conns", Help: "Conexiones totales del pool de Redis."}, func(s *redis.PoolStats) float64 { return float64(s.TotalConns) }},
		{prometheus.GaugeOpts{Name: "redis_pool_idle_conns", Help: "Conexiones idle del pool de Redis."}, func(s *redis.PoolStats) float64 { return float64(s.IdleConns) }},
		{prometheus.GaugeOpts{Name: "redis_pool_stale_conns", Help: "Conexiones stale removidas del pool de Redis."}, func(s *redis.PoolStats) float64 { return float64(s.StaleConns) }},
	}

	collectorsToRegister := make([]prometheus.Collector, 0, len(specs))
	m.RedisPoolHits = prometheus.NewGaugeFunc(specs[0].opts, func() float64 { return specs[0].get(stats()) })
	m.RedisPoolMisses = prometheus.NewGaugeFunc(specs[1].opts, func() float64 { return specs[1].get(stats()) })
	m.RedisPoolTimeouts = prometheus.NewGaugeFunc(specs[2].opts, func() float64 { return specs[2].get(stats()) })
	m.RedisPoolTotalConns = prometheus.NewGaugeFunc(specs[3].opts, func() float64 { return specs[3].get(stats()) })
	m.RedisPoolIdleConns = prometheus.NewGaugeFunc(specs[4].opts, func() float64 { return specs[4].get(stats()) })
	m.RedisPoolStaleConns = prometheus.NewGaugeFunc(specs[5].opts, func() float64 { return specs[5].get(stats()) })

	collectorsToRegister = append(collectorsToRegister,
		m.RedisPoolHits, m.RedisPoolMisses, m.RedisPoolTimeouts,
		m.RedisPoolTotalConns, m.RedisPoolIdleConns, m.RedisPoolStaleConns,
	)
	return m.registerAll(collectorsToRegister...)
}

// registerAll registra varios colectores y devuelve el primer error.
func (m *Metrics) registerAll(cs ...prometheus.Collector) error {
	for _, c := range cs {
		if err := m.registry.Register(c); err != nil {
			return err
		}
	}
	return nil
}
