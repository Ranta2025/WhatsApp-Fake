package websocket

import (
	"encoding/json"
	"errors"
	"sync"
	"testing"

	"gorm/backend/schemas"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ─────────────────────────────────────────────────────────────────────────────
// WP3: Web Push. Los handlers avisan al notificador (asíncrono) solo cuando el
// destinatario no está conectado y el mensaje no es un reenvío (duplicate).
// ─────────────────────────────────────────────────────────────────────────────

type directPushCall struct {
	receiver, sender string
	msg              schemas.Message
}

type groupPushCall struct {
	groupID  uint
	sender   string
	msg      schemas.GroupMessageResponse
	isOnline func(string) bool
}

// fakePushNotifier registra las llamadas de forma síncrona.
type fakePushNotifier struct {
	mu     sync.Mutex
	direct []directPushCall
	group  []groupPushCall
}

func (f *fakePushNotifier) NotifyDirect(receiver, sender string, msg schemas.Message) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.direct = append(f.direct, directPushCall{receiver, sender, msg})
}

func (f *fakePushNotifier) NotifyGroup(groupID uint, sender string, msg schemas.GroupMessageResponse, isOnline func(string) bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.group = append(f.group, groupPushCall{groupID, sender, msg, isOnline})
}

func TestHandleChatMessage_OfflineReceiverIsPushed(t *testing.T) {
	h, sender, _ := directHarness(&fakeIdemChatService{})
	push := &fakePushNotifier{}
	h.SetPushNotifier(push)

	NewMessageHandler(sender, h, json.RawMessage(`{"receptor":"+5","message":"hola"}`)).HandleChatMessage()

	require.Len(t, push.direct, 1)
	assert.Equal(t, "+5", push.direct[0].receiver)
	assert.Equal(t, "+1", push.direct[0].sender)
	assert.Equal(t, uint(77), push.direct[0].msg.MessageID)
	assert.Equal(t, "hola", push.direct[0].msg.Message)
}

func TestHandleChatMessage_OnlineReceiverIsNotPushed(t *testing.T) {
	h, sender, _ := directHarness(&fakeIdemChatService{})
	push := &fakePushNotifier{}
	h.SetPushNotifier(push)

	NewMessageHandler(sender, h, json.RawMessage(`{"receptor":"+2","message":"hola"}`)).HandleChatMessage()

	assert.Empty(t, push.direct)
}

func TestHandleChatMessage_DuplicateIsNotPushed(t *testing.T) {
	h, sender, _ := directHarness(&fakeIdemChatService{duplicate: true})
	push := &fakePushNotifier{}
	h.SetPushNotifier(push)

	NewMessageHandler(sender, h, json.RawMessage(`{"receptor":"+5","message":"hola","clientID":"`+wsTestClientID+`"}`)).HandleChatMessage()

	assert.Empty(t, push.direct)
}

func TestHandleChatMessage_SaveErrorIsNotPushed(t *testing.T) {
	h, sender, _ := directHarness(&fakeIdemChatService{err: errors.New("db caída")})
	push := &fakePushNotifier{}
	h.SetPushNotifier(push)

	NewMessageHandler(sender, h, json.RawMessage(`{"receptor":"+5","message":"hola"}`)).HandleChatMessage()

	assert.Empty(t, push.direct)
}

func TestHandleChatMessage_WithoutPushNotifierDoesNotPanic(t *testing.T) {
	h, sender, _ := directHarness(&fakeIdemChatService{})
	assert.NotPanics(t, func() {
		NewMessageHandler(sender, h, json.RawMessage(`{"receptor":"+5","message":"hola"}`)).HandleChatMessage()
	})
}

func TestHandleGroupChatMessage_NotifiesWithHubPresence(t *testing.T) {
	h, sender, _ := directHarness(nil)
	sender.ServiceGroup = &fakeIdemGroupService{}
	push := &fakePushNotifier{}
	h.SetPushNotifier(push)

	NewMessageHandler(sender, h, json.RawMessage(`{"groupID":7,"message":"hola"}`)).HandleGroupChatMessage()

	require.Len(t, push.group, 1)
	call := push.group[0]
	assert.Equal(t, uint(7), call.groupID)
	assert.Equal(t, "+1", call.sender)
	assert.Equal(t, uint(88), call.msg.MessageID)
	require.NotNil(t, call.isOnline)
	assert.True(t, call.isOnline("+2"), "conectado en el hub")
	assert.False(t, call.isOnline("+9"), "desconectado")
}

func TestHandleGroupChatMessage_DuplicateIsNotPushed(t *testing.T) {
	h, sender, _ := directHarness(nil)
	sender.ServiceGroup = &fakeIdemGroupService{duplicate: true}
	push := &fakePushNotifier{}
	h.SetPushNotifier(push)

	NewMessageHandler(sender, h, json.RawMessage(`{"groupID":7,"message":"hola","clientID":"`+wsTestClientID+`"}`)).HandleGroupChatMessage()

	assert.Empty(t, push.group)
}
