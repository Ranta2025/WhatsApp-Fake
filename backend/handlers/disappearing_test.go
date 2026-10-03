package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"gorm/backend/models"
	"gorm/backend/schemas"
	"gorm/backend/services"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ── 1:1 ──────────────────────────────────────────────────────────────────────

type stubChatDisappear struct {
	services.ChatServicer
	changed bool
	msg     *schemas.Message
	err     error
	seconds int
	gotSecs int
	called  bool
}

func (s *stubChatDisappear) SetChatDisappearing(actor, contact string, seconds int, ctx context.Context) (bool, *schemas.Message, error) {
	s.called, s.gotSecs = true, seconds
	return s.changed, s.msg, s.err
}
func (s *stubChatDisappear) GetChatDisappearing(actor, contact string, ctx context.Context) (int, error) {
	return s.seconds, s.err
}

func runPutChatDisappearing(stub *stubChatDisappear, n *fakeNotifier, body string) (*httptest.ResponseRecorder, map[string]interface{}) {
	h := &HandlerChat{service: stub, notifier: n}
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("PUT", "/chat/+luis/disappearing", strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("telephon", "+ana")
	c.Set("contact", "+luis")
	h.HandlerSetDisappearing()(c)
	var out map[string]interface{}
	_ = json.Unmarshal(w.Body.Bytes(), &out)
	return w, out
}

func TestHandlerSetChatDisappearing_InvalidValue400(t *testing.T) {
	stub := &stubChatDisappear{err: models.ErrInvalidDisappearDuration}
	n := &fakeNotifier{}
	w, _ := runPutChatDisappearing(stub, n, `{"seconds":3600}`)
	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Empty(t, n.sent)
}

func TestHandlerSetChatDisappearing_MissingSeconds400(t *testing.T) {
	stub := &stubChatDisappear{}
	w, _ := runPutChatDisappearing(stub, &fakeNotifier{}, `{}`)
	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.False(t, stub.called)
}

func TestHandlerSetChatDisappearing_UnknownContact404(t *testing.T) {
	stub := &stubChatDisappear{err: services.ErrChatContactNotFound}
	w, _ := runPutChatDisappearing(stub, &fakeNotifier{}, `{"seconds":86400}`)
	assert.Equal(t, http.StatusNotFound, w.Code)
}

func TestHandlerSetChatDisappearing_ChangedEnvelopeAndWS(t *testing.T) {
	stub := &stubChatDisappear{changed: true, msg: &schemas.Message{MessageID: 8, Kind: "system"}}
	n := &fakeNotifier{}

	w, out := runPutChatDisappearing(stub, n, `{"seconds":86400}`)

	require.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, 86400, stub.gotSecs)
	assert.Equal(t, "direct", out["kind"])
	assert.Equal(t, "+luis", out["key"])
	assert.EqualValues(t, 86400, out["seconds"])
	assert.Equal(t, "+ana", out["byTelephon"])
	sm, ok := out["systemMessage"].(map[string]interface{})
	require.True(t, ok)
	assert.EqualValues(t, 8, sm["MessageID"])

	// Ambos usuarios reciben el evento; cada uno con la clave del OTRO.
	pAna, okA := findEvent(n, "disappearing_changed", "+ana")
	pLuis, okL := findEvent(n, "disappearing_changed", "+luis")
	require.True(t, okA && okL)
	assert.Equal(t, "+luis", pAna["key"])
	assert.Equal(t, "+ana", pLuis["key"])
	assert.Equal(t, "direct", pLuis["kind"])
	assert.EqualValues(t, 86400, pLuis["seconds"])
	assert.Equal(t, "+ana", pLuis["byTelephon"])
	assert.NotNil(t, pLuis["systemMessage"])
}

func TestHandlerSetChatDisappearing_UnchangedNoWSNoSystemMessage(t *testing.T) {
	stub := &stubChatDisappear{changed: false}
	n := &fakeNotifier{}

	w, out := runPutChatDisappearing(stub, n, `{"seconds":0}`)

	require.Equal(t, http.StatusOK, w.Code)
	assert.Nil(t, out["systemMessage"])
	assert.Empty(t, n.sent, "sin cambio no hay evento WS")
}

func TestHandlerGetChatSettings(t *testing.T) {
	stub := &stubChatDisappear{seconds: 604800}
	h := &HandlerChat{service: stub}
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/chat/+luis/settings", nil)
	c.Set("telephon", "+ana")
	c.Set("contact", "+luis")

	h.HandlerGetChatSettings()(c)

	require.Equal(t, http.StatusOK, w.Code)
	assert.JSONEq(t, `{"disappearSeconds":604800}`, w.Body.String())
}

// ── Grupo ────────────────────────────────────────────────────────────────────

type stubGroupDisappear struct {
	services.GroupServicer
	changed bool
	msg     *schemas.GroupMessageResponse
	err     error
	members []string
}

func (s *stubGroupDisappear) SetGroupDisappearing(actor string, groupID uint, seconds int, ctx context.Context) (bool, *schemas.GroupMessageResponse, error) {
	return s.changed, s.msg, s.err
}
func (s *stubGroupDisappear) GetMemberTelephons(groupID uint, ctx context.Context) ([]string, error) {
	return s.members, nil
}

func runPutGroupDisappearing(stub *stubGroupDisappear, n *fakeNotifier, body string) (*httptest.ResponseRecorder, map[string]interface{}) {
	h := &HandlerGroup{service: stub, notifier: n}
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("PUT", "/group/7/disappearing", strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("telephon", "+ana")
	c.Set("groupID", uint(7))
	h.HandleSetDisappearing()(c)
	var out map[string]interface{}
	_ = json.Unmarshal(w.Body.Bytes(), &out)
	return w, out
}

func TestHandleSetGroupDisappearing_InvalidValue400(t *testing.T) {
	w, _ := runPutGroupDisappearing(&stubGroupDisappear{err: models.ErrInvalidDisappearDuration}, &fakeNotifier{}, `{"seconds":5}`)
	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestHandleSetGroupDisappearing_RestrictedMember403(t *testing.T) {
	n := &fakeNotifier{}
	w, _ := runPutGroupDisappearing(&stubGroupDisappear{err: services.ErrGroupEditRestricted}, n, `{"seconds":86400}`)
	assert.Equal(t, http.StatusForbidden, w.Code)
	assert.Empty(t, n.sent)
}

func TestHandleSetGroupDisappearing_ChangedEnvelopeAndWSToAllMembers(t *testing.T) {
	stub := &stubGroupDisappear{
		changed: true,
		msg:     &schemas.GroupMessageResponse{MessageID: 12, SystemEvent: models.SystemEventDisappearingChanged},
		members: []string{"+ana", "+luis", "+eva"},
	}
	n := &fakeNotifier{}

	w, out := runPutGroupDisappearing(stub, n, `{"seconds":604800}`)

	require.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "group", out["kind"])
	assert.EqualValues(t, 7, out["key"])
	assert.EqualValues(t, 604800, out["seconds"])
	assert.Equal(t, "+ana", out["byTelephon"])
	assert.NotNil(t, out["systemMessage"])
	for _, tel := range stub.members {
		p, ok := findEvent(n, "disappearing_changed", tel)
		require.True(t, ok, tel)
		assert.Equal(t, "group", p["kind"])
		assert.EqualValues(t, 7, p["key"])
	}
}

func TestHandleSetGroupDisappearing_UnchangedNoWS(t *testing.T) {
	n := &fakeNotifier{}
	w, out := runPutGroupDisappearing(&stubGroupDisappear{changed: false, members: []string{"+ana"}}, n, `{"seconds":0}`)
	require.Equal(t, http.StatusOK, w.Code)
	assert.Nil(t, out["systemMessage"])
	assert.Empty(t, n.sent)
}
