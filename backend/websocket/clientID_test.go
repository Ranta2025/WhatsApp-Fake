package websocket

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"gorm/backend/models"
	"gorm/backend/schemas"
	"gorm/backend/services"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ─────────────────────────────────────────────────────────────────────────────
// PW8: idempotent sends keyed by clientID. A duplicate is echoed to the sender
// only; receivers never get a second delivery.
// ─────────────────────────────────────────────────────────────────────────────

const wsTestClientID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301"

type fakeIdemChatService struct {
	services.ChatServicer
	got       models.MessageCreat
	duplicate bool
	err       error
}

func (f *fakeIdemChatService) ServiceCreatMessageWithStatus(m models.MessageCreat, _ string, _ context.Context) (schemas.Message, error) {
	f.got = m
	if f.err != nil {
		return schemas.Message{}, f.err
	}
	cid := m.ClientID
	return schemas.Message{
		MessageID: 77, SenderTelephon: m.Telephon, Receptor: m.Receptor, Message: m.Message,
		Time: time.Date(2026, 10, 4, 0, 0, 0, 0, time.UTC), ClientID: &cid, Duplicate: f.duplicate,
	}, nil
}

type fakeIdemGroupService struct {
	services.GroupServicer
	got       models.GroupMessageSend
	duplicate bool
}

func (f *fakeIdemGroupService) SendGroupMessage(_ string, d models.GroupMessageSend, _ context.Context) (*schemas.GroupMessageResponse, error) {
	f.got = d
	cid := d.ClientID
	return &schemas.GroupMessageResponse{MessageID: 88, GroupID: d.GroupID, Message: d.Message, ClientID: &cid, Duplicate: f.duplicate}, nil
}

func directHarness(svc services.ChatServicer) (*Hub, *Client, *Client) {
	h := newTestHub()
	sender := NewClient("ana", "+1", nil)
	sender.ServiceChat = svc
	receiver := NewClient("luis", "+2", nil)
	h.RegisterClient(sender)
	h.RegisterClient(receiver)
	return h, sender, receiver
}

func payloadClientID(t *testing.T, frame []byte) string {
	t.Helper()
	var env struct {
		Payload struct {
			ClientID string `json:"ClientID"`
		} `json:"payload"`
	}
	require.NoError(t, json.Unmarshal(frame, &env))
	return env.Payload.ClientID
}

func TestHandleChatMessage_ParsesClientIDField(t *testing.T) {
	svc := &fakeIdemChatService{}
	h, sender, _ := directHarness(svc)

	NewMessageHandler(sender, h, json.RawMessage(`{"receptor":"+2","message":"hola","clientID":"`+wsTestClientID+`"}`)).HandleChatMessage()

	assert.Equal(t, wsTestClientID, svc.got.ClientID)
}

func TestHandleChatMessage_FirstSendEchoesAndDelivers(t *testing.T) {
	svc := &fakeIdemChatService{}
	h, sender, receiver := directHarness(svc)

	NewMessageHandler(sender, h, json.RawMessage(`{"receptor":"+2","message":"hola","clientID":"`+wsTestClientID+`"}`)).HandleChatMessage()

	own := drain(sender)
	require.Len(t, own, 1)
	assert.Equal(t, wsTestClientID, payloadClientID(t, own[0]))
	assert.Len(t, drain(receiver), 1)
}

func TestHandleChatMessage_DuplicateEchoesSenderOnly(t *testing.T) {
	svc := &fakeIdemChatService{duplicate: true}
	h, sender, receiver := directHarness(svc)

	NewMessageHandler(sender, h, json.RawMessage(`{"receptor":"+2","message":"hola","clientID":"`+wsTestClientID+`"}`)).HandleChatMessage()

	own := drain(sender)
	require.Len(t, own, 1)
	assert.Equal(t, []string{"chat"}, typesIn(t, own))
	assert.Equal(t, wsTestClientID, payloadClientID(t, own[0]))
	assert.Empty(t, drain(receiver), "a replay must not be delivered again")
}

func TestHandleChatMessage_InvalidClientIDSendsError(t *testing.T) {
	svc := &fakeIdemChatService{err: services.ErrInvalidClientID}
	h, sender, receiver := directHarness(svc)

	NewMessageHandler(sender, h, json.RawMessage(`{"receptor":"+2","message":"hola","clientID":"nope"}`)).HandleChatMessage()

	assert.Equal(t, []string{"error"}, typesIn(t, drain(sender)))
	assert.Empty(t, drain(receiver))
}

func TestHandleGroupChatMessage_DuplicateEchoesSenderOnly(t *testing.T) {
	h := newTestHub()
	svc := &fakeIdemGroupService{duplicate: true}
	sender := NewClient("ana", "+1", nil)
	sender.ServiceGroup = svc
	peer := NewClient("luis", "+2", nil)
	h.RegisterClient(sender)
	h.RegisterClient(peer)
	h.JoinRoom(7, sender)
	h.JoinRoom(7, peer)

	NewMessageHandler(sender, h, json.RawMessage(`{"groupID":7,"message":"hola","clientID":"`+wsTestClientID+`"}`)).HandleGroupChatMessage()

	assert.Equal(t, wsTestClientID, svc.got.ClientID)
	own := drain(sender)
	require.Len(t, own, 1)
	assert.Equal(t, wsTestClientID, payloadClientID(t, own[0]))
	assert.Empty(t, drain(peer), "a replay must not be broadcast to the room")
}

func TestHandleGroupChatMessage_FirstSendBroadcasts(t *testing.T) {
	h := newTestHub()
	svc := &fakeIdemGroupService{}
	sender := NewClient("ana", "+1", nil)
	sender.ServiceGroup = svc
	peer := NewClient("luis", "+2", nil)
	h.RegisterClient(sender)
	h.RegisterClient(peer)
	h.JoinRoom(7, sender)
	h.JoinRoom(7, peer)

	NewMessageHandler(sender, h, json.RawMessage(`{"groupID":7,"message":"hola","clientID":"`+wsTestClientID+`"}`)).HandleGroupChatMessage()

	assert.Len(t, drain(sender), 1)
	assert.Len(t, drain(peer), 1)
}
