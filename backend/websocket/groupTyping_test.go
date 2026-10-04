package websocket

import (
	"context"
	"encoding/json"
	"testing"

	"gorm/backend/models"
	"gorm/backend/schemas"
	"gorm/backend/services"
)

// ─────────────────────────────────────────────────────────────────────────────
// GA4: enforcement WS. Un miembro restringido no puede enviar/edit mensajes ni
// mostrar "escribiendo"; el send responde `error` y no difunde a la room.
// ─────────────────────────────────────────────────────────────────────────────

type fakeEnforcementService struct {
	services.GroupServicer
	sendErr   error
	editErr   error
	typingErr error
}

func (f *fakeEnforcementService) SendGroupMessage(string, models.GroupMessageSend, context.Context) (*schemas.GroupMessageResponse, error) {
	return nil, f.sendErr
}

func (f *fakeEnforcementService) EditGroupMessage(string, uint, models.GroupMessageEdit, context.Context) (*schemas.GroupMessageResponse, error) {
	return nil, f.editErr
}

func (f *fakeEnforcementService) RequireCanSend(string, uint, context.Context) error {
	return f.typingErr
}

type enforcementHarness struct {
	hub   *Hub
	actor *Client
	peer  *Client
	svc   *fakeEnforcementService
}

func newEnforcementHarness() *enforcementHarness {
	h := newTestHub()
	svc := &fakeEnforcementService{}
	actor := NewClient("actor", "+1", nil)
	actor.ServiceGroup = svc
	peer := NewClient("peer", "+2", nil)
	h.RegisterClient(actor)
	h.RegisterClient(peer)
	h.JoinRoom(7, actor)
	h.JoinRoom(7, peer)
	return &enforcementHarness{hub: h, actor: actor, peer: peer, svc: svc}
}

func typesIn(t *testing.T, msgs [][]byte) []string {
	t.Helper()
	var out []string
	for _, m := range msgs {
		var env struct {
			Type string `json:"type"`
		}
		if err := json.Unmarshal(m, &env); err != nil {
			t.Fatalf("frame WS inválido: %v (%s)", err, m)
		}
		out = append(out, env.Type)
	}
	return out
}

func TestHandleGroupChatMessage_RestrictedSendsErrorNoBroadcast(t *testing.T) {
	eh := newEnforcementHarness()
	eh.svc.sendErr = services.ErrGroupSendRestricted

	NewMessageHandler(eh.actor, eh.hub, json.RawMessage(`{"groupID":7,"message":"hola"}`)).HandleGroupChatMessage()

	own := typesIn(t, drain(eh.actor))
	if len(own) != 1 || own[0] != "error" {
		t.Fatalf("el remitente restringido debe recibir un `error`: %v", own)
	}
	if peer := typesIn(t, drain(eh.peer)); len(peer) != 0 {
		t.Fatalf("nada debe difundirse a la room: %v", peer)
	}
}

func TestHandleGroupEditMessage_RestrictedSendsErrorNoBroadcast(t *testing.T) {
	eh := newEnforcementHarness()
	eh.svc.editErr = services.ErrGroupSendRestricted

	NewMessageHandler(eh.actor, eh.hub, json.RawMessage(`{"groupID":7,"messageID":3,"message":"editado"}`)).HandleGroupEditMessage()

	own := typesIn(t, drain(eh.actor))
	if len(own) != 1 || own[0] != "error" {
		t.Fatalf("el editor restringido debe recibir un `error`: %v", own)
	}
	if peer := typesIn(t, drain(eh.peer)); len(peer) != 0 {
		t.Fatalf("nada debe difundirse a la room: %v", peer)
	}
}

// Un miembro restringido no puede mostrar "escribiendo": se suprime en silencio.
func TestHandleGroupTyping_RestrictedSuppressed(t *testing.T) {
	eh := newEnforcementHarness()
	eh.svc.typingErr = services.ErrGroupSendRestricted

	NewMessageHandler(eh.actor, eh.hub, json.RawMessage(`{"groupID":7}`)).HandleGroupTyping()

	if peer := typesIn(t, drain(eh.peer)); len(peer) != 0 {
		t.Fatalf("typing restringido no debe difundirse: %v", peer)
	}
	if own := typesIn(t, drain(eh.actor)); len(own) != 0 {
		t.Fatalf("typing suprimido no responde error: %v", own)
	}
}

// Un admin (o un miembro con la restricción apagada) sí difunde el typing.
func TestHandleGroupTyping_AllowedForwards(t *testing.T) {
	eh := newEnforcementHarness()

	NewMessageHandler(eh.actor, eh.hub, json.RawMessage(`{"groupID":7}`)).HandleGroupTyping()

	peer := typesIn(t, drain(eh.peer))
	if len(peer) != 1 || peer[0] != "group_typing" {
		t.Fatalf("el peer debe recibir group_typing: %v", peer)
	}
	if own := typesIn(t, drain(eh.actor)); len(own) != 0 {
		t.Fatalf("el emisor no se auto-notifica: %v", own)
	}
}
