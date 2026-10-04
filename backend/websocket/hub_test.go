package websocket

import (
	"sync"
	"testing"
)

func newTestHub() *Hub {
	return NewHub(nil, nil)
}

// TestHubSendAfterReplaceDoesNotPanic reproduce el escenario de reconexión:
// la conexión antigua se cierra mientras otros goroutines le envían mensajes.
// Antes esto provocaba "send on closed channel" y tumbaba el servidor.
func TestHubSendAfterReplaceDoesNotPanic(t *testing.T) {
	h := newTestHub()
	old := NewClient("user", "+1", nil)
	h.RegisterClient(old)

	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(2)
		go func() {
			defer wg.Done()
			h.SendTo("+1", []byte("x"))
			h.SendToClient(old, []byte("y"))
		}()
		go func() {
			defer wg.Done()
			h.RegisterClient(NewClient("user", "+1", nil))
		}()
	}
	wg.Wait()

	if !old.closed {
		t.Fatal("la conexión reemplazada debería estar cerrada")
	}
	if h.SendToClient(old, []byte("z")) {
		t.Fatal("no se debería poder enviar a una conexión cerrada")
	}
}

func TestHubRoomsIgnoreClosedClients(t *testing.T) {
	h := newTestHub()
	c := NewClient("user", "+1", nil)
	h.RegisterClient(c)
	h.UnregisterClient(c)

	h.JoinRoom(7, c)
	if h.IsInRoom(7, "+1") {
		t.Fatal("un cliente desconectado no debe unirse a rooms")
	}

	c2 := NewClient("user", "+1", nil)
	h.RegisterClient(c2)
	h.JoinRoom(7, c2)
	if !h.IsInRoom(7, "+1") {
		t.Fatal("el cliente activo debería estar en la room")
	}
	h.LeaveRoomByTelephon(7, "+1")
	if h.IsInRoom(7, "+1") {
		t.Fatal("el cliente debería haber salido de la room")
	}
}
