package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"gorm/backend/models"
	"gorm/backend/schemas"
	"gorm/backend/services"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
)

// ── 1:1 ─────────────────────────────────────────────────────────────────────

func runGetChat(svc *MockChatService, query string) *httptest.ResponseRecorder {
	h := &HandlerChat{service: svc}
	c, w := newTestContext("GET", "/chat/2"+query)
	c.Set("telephon", "1")
	c.Set("contact", "2")
	h.HandlerGetChats()(c)
	return w
}

func TestHandlerGetChats_AroundReturnsArrayAndWindowHeaders(t *testing.T) {
	svc := new(MockChatService)
	svc.On("ServiceGetMessagesAround", "1", "2", uint(40), 30, mock.Anything).
		Return([]schemas.Message{{MessageID: 39}, {MessageID: 40}}, true, false, nil)

	w := runGetChat(svc, "?around=40&limit=30")

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "true", w.Header().Get("X-Has-More-Older"))
	assert.Equal(t, "false", w.Header().Get("X-Has-More-Newer"))
	assert.Equal(t, "", w.Header().Get("X-Has-More"), "sin cursor before: el flag clásico no aplica")
	assert.Contains(t, w.Body.String(), `"MessageID": 40`)
	assert.Equal(t, byte('['), w.Body.Bytes()[0])
	svc.AssertExpectations(t)
}

func TestHandlerGetChats_AroundNotFoundIs404(t *testing.T) {
	svc := new(MockChatService)
	svc.On("ServiceGetMessagesAround", "1", "2", uint(99), 0, mock.Anything).
		Return([]schemas.Message(nil), false, false, models.ErrMessageNotFound)

	w := runGetChat(svc, "?around=99")

	assert.Equal(t, http.StatusNotFound, w.Code)
}

func TestHandlerGetChats_AroundInternalErrorIs500(t *testing.T) {
	svc := new(MockChatService)
	svc.On("ServiceGetMessagesAround", "1", "2", uint(5), 0, mock.Anything).
		Return([]schemas.Message(nil), false, false, errors.New("db"))

	assert.Equal(t, http.StatusInternalServerError, runGetChat(svc, "?around=5").Code)
}

func TestHandlerGetChats_AfterReturnsArrayAndNewerHeader(t *testing.T) {
	svc := new(MockChatService)
	svc.On("ServiceGetMessagesAfter", "1", "2", uint(40), 20, mock.Anything).
		Return([]schemas.Message{{MessageID: 41}}, true, nil)

	w := runGetChat(svc, "?after=40&limit=20")

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "true", w.Header().Get("X-Has-More-Newer"))
	assert.Equal(t, "", w.Header().Get("X-Has-More-Older"))
	svc.AssertExpectations(t)
}

func TestHandlerGetChats_AroundWinsOverAfterAndBefore(t *testing.T) {
	svc := new(MockChatService)
	svc.On("ServiceGetMessagesAround", "1", "2", uint(7), 0, mock.Anything).
		Return([]schemas.Message{}, false, false, nil)

	runGetChat(svc, "?around=7&after=3&before=9")

	svc.AssertExpectations(t)
	svc.AssertNotCalled(t, "ServiceGetMessagesAfter", mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything)
}

func TestHandlerGetChats_InvalidAroundFallsBackToLegacy(t *testing.T) {
	svc := new(MockChatService)
	svc.On("ServiceGetMessagesPage", "1", "2", uint(0), 0, mock.Anything).Return([]schemas.Message{}, false, nil)

	w := runGetChat(svc, "?around=abc&after=0")

	assert.Equal(t, "false", w.Header().Get("X-Has-More"))
	svc.AssertExpectations(t)
}

// ── Grupos ──────────────────────────────────────────────────────────────────

type stubGroupWindowService struct {
	services.GroupServicer
	msgs                []schemas.GroupMessageResponse
	hasOlder, hasNewer  bool
	err                 error
	gotAround, gotAfter uint
	gotLimit            int
	pageCalled          bool
}

func (s *stubGroupWindowService) GetGroupMessagesAround(telephon string, groupID, around uint, limit int, ctx context.Context) ([]schemas.GroupMessageResponse, bool, bool, error) {
	s.gotAround, s.gotLimit = around, limit
	return s.msgs, s.hasOlder, s.hasNewer, s.err
}

func (s *stubGroupWindowService) GetGroupMessagesAfter(telephon string, groupID, after uint, limit int, ctx context.Context) ([]schemas.GroupMessageResponse, bool, error) {
	s.gotAfter, s.gotLimit = after, limit
	return s.msgs, s.hasNewer, s.err
}

func (s *stubGroupWindowService) GetGroupMessagesPage(telephon string, groupID, before uint, limit, offset int, ctx context.Context) ([]schemas.GroupMessageResponse, bool, error) {
	s.pageCalled = true
	return nil, false, nil
}

func runGroupWindow(stub *stubGroupWindowService, query string) (*httptest.ResponseRecorder, map[string]any) {
	h := &HandlerGroup{service: stub}
	c, w := newTestContext("GET", "/group/7/message"+query)
	c.Set("telephon", "123")
	c.Set("groupID", uint(7))
	h.HandleGetGroupMessages()(c)
	return w, decodeBody(w)
}

func TestHandleGetGroupMessages_AroundIncludesWindowFlags(t *testing.T) {
	stub := &stubGroupWindowService{msgs: []schemas.GroupMessageResponse{{MessageID: 5}}, hasOlder: true, hasNewer: false}
	w, body := runGroupWindow(stub, "?around=5&limit=30")

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, uint(5), stub.gotAround)
	assert.Equal(t, 30, stub.gotLimit)
	assert.Equal(t, true, body["hasMoreOlder"])
	assert.Equal(t, false, body["hasMoreNewer"])
	assert.Contains(t, body, "messages")
	assert.False(t, stub.pageCalled)
}

func TestHandleGetGroupMessages_AfterIncludesNewerFlag(t *testing.T) {
	stub := &stubGroupWindowService{msgs: []schemas.GroupMessageResponse{{MessageID: 9}}, hasNewer: true}
	w, body := runGroupWindow(stub, "?after=8&limit=10")

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, uint(8), stub.gotAfter)
	assert.Equal(t, true, body["hasMoreNewer"])
	assert.NotContains(t, body, "hasMoreOlder")
}

func TestHandleGetGroupMessages_WindowErrorMapping(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want int
	}{
		{"no miembro", services.ErrNotGroupMember, http.StatusForbidden},
		{"mensaje inexistente", models.ErrGroupMessageNotFound, http.StatusNotFound},
		{"error interno", errors.New("db"), http.StatusInternalServerError},
	}
	for _, tc := range cases {
		w, _ := runGroupWindow(&stubGroupWindowService{err: tc.err}, "?around=5")
		assert.Equal(t, tc.want, w.Code, tc.name)
		w, _ = runGroupWindow(&stubGroupWindowService{err: tc.err}, "?after=5")
		assert.Equal(t, tc.want, w.Code, tc.name)
	}
}

func TestHandleGetGroupMessages_WithoutWindowParamsUsesLegacyPage(t *testing.T) {
	stub := &stubGroupWindowService{}
	runGroupWindow(stub, "?before=4")
	assert.True(t, stub.pageCalled)
}

func decodeBody(w *httptest.ResponseRecorder) map[string]any {
	var out map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &out)
	return out
}
