package handlers

import (
	"net/http"
	"testing"

	"gorm/backend/schemas"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ─────────────────────────────────────────────────────────────────────────────
// WP3: el envío REST a un grupo dispara Web Push igual que el WS `group_chat`.
// ─────────────────────────────────────────────────────────────────────────────

type groupPushCall struct {
	groupID  uint
	sender   string
	msg      schemas.GroupMessageResponse
	isOnline func(string) bool
}

type fakeGroupPushNotifier struct{ group []groupPushCall }

func (f *fakeGroupPushNotifier) NotifyDirect(string, string, schemas.Message) {}

func (f *fakeGroupPushNotifier) NotifyGroup(groupID uint, sender string, msg schemas.GroupMessageResponse, isOnline func(string) bool) {
	f.group = append(f.group, groupPushCall{groupID, sender, msg, isOnline})
}

// presenceNotifier es un GroupHubNotifier que además sabe quién está conectado
// (como el Hub real).
type presenceNotifier struct {
	recordingGroupNotifier
	online map[string]bool
}

func (p *presenceNotifier) IsOnline(telephon string) bool { return p.online[telephon] }

func TestHandleSendGroupMessage_PushesWithHubPresence(t *testing.T) {
	n := &presenceNotifier{online: map[string]bool{"+2": true}}
	push := &fakeGroupPushNotifier{}
	h := InitHandlerGroup(&idemGroupService{}, n, nil)
	h.SetPushNotifier(push)

	w := runGroupSendWith(t, h, `{"groupID":7,"message":"hola"}`)

	require.Equal(t, http.StatusCreated, w.Code)
	require.Len(t, push.group, 1)
	call := push.group[0]
	assert.Equal(t, uint(7), call.groupID)
	assert.Equal(t, "+1", call.sender)
	assert.Equal(t, uint(88), call.msg.MessageID)
	require.NotNil(t, call.isOnline)
	assert.True(t, call.isOnline("+2"))
	assert.False(t, call.isOnline("+3"))
}

func TestHandleSendGroupMessage_DuplicateIsNotPushed(t *testing.T) {
	push := &fakeGroupPushNotifier{}
	h := InitHandlerGroup(&idemGroupService{duplicate: true}, &recordingGroupNotifier{}, nil)
	h.SetPushNotifier(push)

	w := runGroupSendWith(t, h, `{"groupID":7,"message":"hola","clientID":"`+restTestClientID+`"}`)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Empty(t, push.group)
}

func TestHandleSendGroupMessage_WithoutPresenceTreatsAllOffline(t *testing.T) {
	push := &fakeGroupPushNotifier{}
	h := InitHandlerGroup(&idemGroupService{}, nil, nil)
	h.SetPushNotifier(push)

	w := runGroupSendWith(t, h, `{"groupID":7,"message":"hola"}`)

	require.Equal(t, http.StatusCreated, w.Code)
	require.Len(t, push.group, 1)
	assert.False(t, push.group[0].isOnline("+2"))
}

func TestHandleSendGroupMessage_WithoutPushNotifierStillWorks(t *testing.T) {
	h := InitHandlerGroup(&idemGroupService{}, &recordingGroupNotifier{}, nil)
	w := runGroupSendWith(t, h, `{"groupID":7,"message":"hola"}`)
	assert.Equal(t, http.StatusCreated, w.Code)
}
