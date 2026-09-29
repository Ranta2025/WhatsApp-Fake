// Package metrics define la superficie de métricas Prometheus del backend y
// construye su registry aislado. No usa el registry global: cada constructor
// recibe el registry para que los tests puedan crear instancias independientes.
package metrics

import (
	"net/http"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// Tipos de mensaje que etiquetan messages_sent_total y messages_failed_total.
const (
	KindDirect = "direct"
	KindGroup  = "group"
)

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

	MessagesSentTotal   *prometheus.CounterVec
	MessagesFailedTotal *prometheus.CounterVec

	DependencyUp *prometheus.GaugeVec
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
	)

	return m
}

// Registry devuelve el registry subyacente que agrupa estas métricas.
func (m *Metrics) Registry() *prometheus.Registry { return m.registry }

// Handler expone el registry en el formato de texto de Prometheus.
func (m *Metrics) Handler() http.Handler {
	return promhttp.HandlerFor(m.registry, promhttp.HandlerOpts{})
}
