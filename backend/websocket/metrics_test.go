package websocket

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"gorm/backend/metrics"
	"gorm/backend/models"
	"gorm/backend/schemas"
	"gorm/backend/services"

	"github.com/gorilla/websocket"
	"github.com/prometheus/client_golang/prometheus/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ==================== OB4: Hub.Stats y contadores ====================

// TestHubStatsReflectsConnectionsRoomsAndMemberships comprueba la foto que
// alimenta los gauges ws_connections / ws_rooms / ws_room_memberships.
func TestHubStatsReflectsConnectionsRoomsAndMemberships(t *testing.T) {
	h := NewHub(nil, nil)
	c1 := NewClient("u1", "+1", nil)
	c2 := NewClient("u2", "+2", nil)
	h.RegisterClient(c1)
	h.RegisterClient(c2)

	h.JoinRoom(10, c1)
	h.JoinRoom(10, c2)
	h.JoinRoom(20, c1)

	stats := h.Stats()
	assert.Equal(t, 2, stats.Connections)
	assert.Equal(t, 2, stats.Rooms)
	assert.Equal(t, 3, stats.RoomMemberships)
}

func TestHubStatsIgnoreClosedClients(t *testing.T) {
	h := NewHub(nil, nil)
	c := NewClient("u1", "+1", nil)
	h.RegisterClient(c)
	h.JoinRoom(10, c)
	h.UnregisterClient(c)

	stats := h.Stats()
	assert.Equal(t, 0, stats.Connections)
	assert.Equal(t, 0, stats.Rooms)
	assert.Equal(t, 0, stats.RoomMemberships)
}

func TestHubMetricsCountersOnRegisterUnregisterAndDrop(t *testing.T) {
	m := metrics.New(metrics.NewRegistry())
	h := NewHub(nil, m)
	c := NewClient("u", "+1", nil)
	h.RegisterClient(c)
	assert.Equal(t, 1.0, testutil.ToFloat64(m.WSConnectionsTotal))

	// Llenar el buffer: el siguiente envío se descarta por buffer lleno.
	for i := 0; i < cap(c.Send); i++ {
		h.SendTo("+1", []byte("x"))
	}
	h.SendTo("+1", []byte("x"))
	assert.Equal(t, 1.0, testutil.ToFloat64(m.WSSendDroppedTotal))

	// Enviar a una conexión ya cerrada NO es un drop por buffer lleno.
	h.UnregisterClient(c)
	assert.Equal(t, 1.0, testutil.ToFloat64(m.WSDisconnectsTotal))
	assert.False(t, h.SendToClient(c, []byte("y")))
	assert.Equal(t, 1.0, testutil.ToFloat64(m.WSSendDroppedTotal), "cerrado no cuenta como drop")
}

// TestMessageMetricTypeRestrictsToRouterKeys es la garantía de cardinalidad:
// solo los tipos de buildRouter() tienen su propia etiqueta; todo lo demás
// (incluido un type arbitrario enviado por el cliente) colapsa a "unknown".
func TestMessageMetricTypeRestrictsToRouterKeys(t *testing.T) {
	router := NewClient("u", "+1", nil).buildRouter()

	assert.Equal(t, "chat", messageMetricType(router, "chat"))
	assert.Equal(t, "group_chat", messageMetricType(router, "group_chat"))
	assert.Equal(t, "unknown", messageMetricType(router, "totally_arbitrary_type"))
	assert.Equal(t, "unknown", messageMetricType(router, "ping"))
	assert.Equal(t, "unknown", messageMetricType(router, ""))
}

// TestReadPumpCountsMessagesWithBoundedTypeLabel ejercita el dispatch real por
// WebSocket: un type conocido se etiqueta con su nombre y un type arbitrario
// nunca crea su propia serie (se cuenta como "unknown").
func TestReadPumpCountsMessagesWithBoundedTypeLabel(t *testing.T) {
	m := metrics.New(metrics.NewRegistry())
	hub := NewHub(nil, m)

	var upgrader websocket.Upgrader
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		c := NewClient("u", "+1", conn)
		go c.writePump()
		c.readPump(hub)
	}))
	defer srv.Close()

	conn, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(srv.URL, "http"), nil)
	require.NoError(t, err)
	defer conn.Close()

	require.NoError(t, conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"totally_arbitrary_type","payload":{}}`)))
	require.Eventually(t, func() bool {
		return testutil.ToFloat64(m.WSMessagesReceivedTotal.WithLabelValues("unknown")) >= 1
	}, time.Second, 5*time.Millisecond)

	require.NoError(t, conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"typing","payload":{"to":"+2"}}`)))
	require.Eventually(t, func() bool {
		return testutil.ToFloat64(m.WSMessagesReceivedTotal.WithLabelValues("typing")) >= 1
	}, time.Second, 5*time.Millisecond)

	assertNoMessageTypeSeries(t, m, "totally_arbitrary_type")
}

// assertNoMessageTypeSeries verifica que ninguna serie de
// ws_messages_received_total use el type indicado.
func assertNoMessageTypeSeries(t *testing.T, m *metrics.Metrics, arbitrary string) {
	t.Helper()
	families, err := m.Registry().Gather()
	require.NoError(t, err)
	for _, family := range families {
		if family.GetName() != "ws_messages_received_total" {
			continue
		}
		for _, metric := range family.GetMetric() {
			for _, label := range metric.GetLabel() {
				if label.GetName() == "type" {
					assert.NotEqual(t, arbitrary, label.GetValue())
				}
			}
		}
	}
}

// ==================== OB4: contadores de mensajes ====================

type fakeChatMetricsService struct {
	services.ChatServicer
	err error
}

func (f *fakeChatMetricsService) ServiceCreatMessageWithStatus(models.MessageCreat, string, context.Context) (schemas.Message, error) {
	return schemas.Message{}, f.err
}

type fakeGroupMetricsService struct {
	services.GroupServicer
	err error
}

func (f *fakeGroupMetricsService) SendGroupMessage(string, models.GroupMessageSend, context.Context) (*schemas.GroupMessageResponse, error) {
	if f.err != nil {
		return nil, f.err
	}
	return &schemas.GroupMessageResponse{GroupID: 7}, nil
}

func TestHandleChatMessageCountsSentAndFailed(t *testing.T) {
	m := metrics.New(metrics.NewRegistry())
	hub := NewHub(nil, m)
	c := NewClient("u", "+1", nil)
	payload := json.RawMessage(`{"receptor":"+2","message":"hola"}`)

	c.ServiceChat = &fakeChatMetricsService{}
	NewMessageHandler(c, hub, payload).HandleChatMessage()
	assert.Equal(t, 1.0, testutil.ToFloat64(m.MessagesSentTotal.WithLabelValues(metrics.KindDirect)))

	c.ServiceChat = &fakeChatMetricsService{err: errors.New("boom")}
	NewMessageHandler(c, hub, payload).HandleChatMessage()
	assert.Equal(t, 1.0, testutil.ToFloat64(m.MessagesFailedTotal.WithLabelValues(metrics.KindDirect)))
	assert.Equal(t, 1.0, testutil.ToFloat64(m.MessagesSentTotal.WithLabelValues(metrics.KindDirect)), "un fallo no cuenta como enviado")
}

func TestHandleGroupChatMessageCountsSentAndFailed(t *testing.T) {
	m := metrics.New(metrics.NewRegistry())
	hub := NewHub(nil, m)
	c := NewClient("u", "+1", nil)
	payload := json.RawMessage(`{"groupID":7,"message":"hola"}`)

	c.ServiceGroup = &fakeGroupMetricsService{}
	NewMessageHandler(c, hub, payload).HandleGroupChatMessage()
	assert.Equal(t, 1.0, testutil.ToFloat64(m.MessagesSentTotal.WithLabelValues(metrics.KindGroup)))

	c.ServiceGroup = &fakeGroupMetricsService{err: errors.New("boom")}
	NewMessageHandler(c, hub, payload).HandleGroupChatMessage()
	assert.Equal(t, 1.0, testutil.ToFloat64(m.MessagesFailedTotal.WithLabelValues(metrics.KindGroup)))
	assert.Equal(t, 1.0, testutil.ToFloat64(m.MessagesSentTotal.WithLabelValues(metrics.KindGroup)), "un fallo no cuenta como enviado")
}
