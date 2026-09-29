package websocket

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"gorm/backend/middleware"
	"gorm/backend/schemas"
	"gorm/backend/services"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ==================== OB5: propagación del id a los logs WS ====================

// syncBuffer permite capturar logs escritos desde varias goroutines.
type syncBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (b *syncBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.Write(p)
}

// records devuelve los registros JSON capturados hasta ahora.
func (b *syncBuffer) records(t *testing.T) []map[string]any {
	t.Helper()
	b.mu.Lock()
	defer b.mu.Unlock()
	var out []map[string]any
	for _, line := range strings.Split(strings.TrimSpace(b.buf.String()), "\n") {
		if line == "" {
			continue
		}
		var rec map[string]any
		require.NoError(t, json.Unmarshal([]byte(line), &rec), line)
		out = append(out, rec)
	}
	return out
}

// captureSlog reemplaza el logger por defecto por uno JSON en memoria.
func captureSlog(t *testing.T) *syncBuffer {
	t.Helper()
	buf := &syncBuffer{}
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(buf, &slog.HandlerOptions{Level: slog.LevelDebug})))
	t.Cleanup(func() { slog.SetDefault(prev) })
	return buf
}

func findRecord(recs []map[string]any, msg string) map[string]any {
	for _, r := range recs {
		if r["msg"] == msg {
			return r
		}
	}
	return nil
}

func TestHubRegisterReplaceAndUnregisterLogConnID(t *testing.T) {
	buf := captureSlog(t)
	h := newTestHub()

	old := NewClient("u", "+1", nil)
	old.ConnID = "conn-old"
	h.RegisterClient(old)

	fresh := NewClient("u", "+1", nil)
	fresh.ConnID = "conn-new"
	h.RegisterClient(fresh)
	h.UnregisterClient(fresh)

	recs := buf.records(t)
	connected := findRecord(recs, "ws conectado")
	require.NotNil(t, connected, "%v", recs)
	assert.Equal(t, "conn-old", connected["conn_id"])

	replaced := findRecord(recs, "ws conexión reemplazada")
	require.NotNil(t, replaced, "%v", recs)
	assert.Equal(t, "conn-old", replaced["conn_id"])

	disconnected := findRecord(recs, "ws desconectado")
	require.NotNil(t, disconnected, "%v", recs)
	assert.Equal(t, "conn-new", disconnected["conn_id"])
	assert.Equal(t, float64(0), disconnected["total"])

	for _, r := range recs {
		assert.NotContains(t, r, "tel", "no se loguea el teléfono")
	}
}

// startPump levanta un servidor WS cuyo handler corre readPump con el Client
// dado y devuelve la conexión del cliente.
func startPump(t *testing.T, hub *Hub, connID string) *websocket.Conn {
	t.Helper()
	var upgrader websocket.Upgrader
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		c := NewClient("u", "+1", conn)
		c.ConnID = connID
		go c.writePump()
		c.readPump(hub)
	}))
	t.Cleanup(srv.Close)
	conn, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(srv.URL, "http"), nil)
	require.NoError(t, err)
	t.Cleanup(func() { conn.Close() })
	return conn
}

func TestReadPumpLogsBadPayloadAndUnknownTypeWithConnID(t *testing.T) {
	buf := captureSlog(t)
	conn := startPump(t, newTestHub(), "conn-pump")

	require.NoError(t, conn.WriteMessage(websocket.TextMessage, []byte(`not json`)))
	require.NoError(t, conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"mystery","payload":{}}`)))

	require.Eventually(t, func() bool {
		return findRecord(buf.records(t), "ws tipo de mensaje desconocido") != nil
	}, 2*time.Second, 10*time.Millisecond)

	recs := buf.records(t)
	bad := findRecord(recs, "ws formato JSON inválido")
	require.NotNil(t, bad, "%v", recs)
	assert.Equal(t, "conn-pump", bad["conn_id"])
	assert.NotEmpty(t, bad["err"])

	unknown := findRecord(recs, "ws tipo de mensaje desconocido")
	assert.Equal(t, "conn-pump", unknown["conn_id"])
	assert.Equal(t, "mystery", unknown["type"])
}

func TestMessageHandlerLogsWithConnIDAndType(t *testing.T) {
	buf := captureSlog(t)
	c := NewClient("u", "+1", nil)
	c.ConnID = "conn-h"

	NewMessageHandler(c, newTestHub(), json.RawMessage(`"no es un objeto"`)).HandleChatMessage()

	rec := findRecord(buf.records(t), "ws error al deserializar mensaje")
	require.NotNil(t, rec)
	assert.Equal(t, "conn-h", rec["conn_id"])
	assert.Equal(t, "chat", rec["type"])
	assert.NotEmpty(t, rec["err"])
}

// Fakes mínimos para initClient (solo los métodos que invoca al conectar).
type noopChat struct{ services.ChatServicer }

func (noopChat) ServiceGetSendersAndMarkDelivered(string, context.Context) ([]string, error) {
	return nil, nil
}

type noopGroup struct{ services.GroupServicer }

func (noopGroup) GetUserGroups(string, context.Context) ([]schemas.GroupResponse, error) {
	return nil, nil
}

// El id del request HTTP que hace el upgrade llega a los logs de la conexión.
func TestHandleWebSocketPropagatesRequestIDToConnLogs(t *testing.T) {
	buf := captureSlog(t)
	gin.SetMode(gin.TestMode)
	hub := newTestHub()

	engine := gin.New()
	engine.Use(middleware.RequestID())
	engine.GET("/ws", func(c *gin.Context) {
		c.Set("username", "u")
		c.Set("telephon", "+1")
	}, HandleWebSocket(hub, noopChat{}, nil, nil, noopGroup{}))
	srv := httptest.NewServer(engine)
	defer srv.Close()

	header := http.Header{"X-Request-Id": []string{"req-abc-123"}}
	conn, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(srv.URL, "http")+"/ws", header)
	require.NoError(t, err)

	require.Eventually(t, func() bool {
		return findRecord(buf.records(t), "ws conectado") != nil
	}, 2*time.Second, 10*time.Millisecond)
	assert.Equal(t, "req-abc-123", findRecord(buf.records(t), "ws conectado")["conn_id"])

	conn.Close()
	require.Eventually(t, func() bool {
		return findRecord(buf.records(t), "ws desconectado") != nil
	}, 2*time.Second, 10*time.Millisecond)
	assert.Equal(t, "req-abc-123", findRecord(buf.records(t), "ws desconectado")["conn_id"])
}
