package handlers

import (
	"context"
	"errors"
	"gorm/backend/schemas"
	"gorm/backend/services"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
)

func newTestContext(method, target string) (*gin.Context, *httptest.ResponseRecorder) {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(method, target, nil)
	return c, w
}

// ── 1:1 ─────────────────────────────────────────────────────────────────────

func TestHandlerSearchChat_OK(t *testing.T) {
	svc := new(MockChatService)
	page := &schemas.SearchPage{Results: []schemas.SearchResult{{MessageID: 4, Snippet: "hola", Highlights: [][2]int{{0, 4}}}}, HasMore: true}
	svc.On("ServiceSearchMessages", "1", "2", "hola", uint(30), 10, mock.Anything).Return(page, nil)
	h := &HandlerChat{service: svc}

	c, w := newTestContext("GET", "/chat/2/search?q=hola&before=30&limit=10")
	c.Set("telephon", "1")
	c.Set("contact", "2")
	h.HandlerSearchChat()(c)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.JSONEq(t, `{"results":[{"messageID":4,"time":"0001-01-01T00:00:00Z","snippet":"hola","highlights":[[0,4]]}],"hasMore":true}`, w.Body.String())
	svc.AssertExpectations(t)
}

func TestHandlerSearchChat_InvalidParamsUseDefaults(t *testing.T) {
	svc := new(MockChatService)
	svc.On("ServiceSearchMessages", "1", "2", "hola", uint(0), 0, mock.Anything).Return(&schemas.SearchPage{Results: []schemas.SearchResult{}}, nil)
	h := &HandlerChat{service: svc}

	c, _ := newTestContext("GET", "/chat/2/search?q=hola&before=abc&limit=-3")
	c.Set("telephon", "1")
	c.Set("contact", "2")
	h.HandlerSearchChat()(c)

	svc.AssertExpectations(t)
}

func TestHandlerSearchChat_ErrorMapping(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want int
	}{
		{"consulta inválida", services.ErrInvalidSearchQuery, http.StatusBadRequest},
		{"error interno", errors.New("db"), http.StatusInternalServerError},
	}
	for _, tc := range cases {
		svc := new(MockChatService)
		svc.On("ServiceSearchMessages", "1", "2", "x", uint(0), 0, mock.Anything).Return((*schemas.SearchPage)(nil), tc.err)
		h := &HandlerChat{service: svc}
		c, w := newTestContext("GET", "/chat/2/search?q=x")
		c.Set("telephon", "1")
		c.Set("contact", "2")
		h.HandlerSearchChat()(c)
		assert.Equal(t, tc.want, w.Code, tc.name)
	}
}

func TestHandlerSearchChat_MissingContext(t *testing.T) {
	h := &HandlerChat{service: new(MockChatService)}
	c, w := newTestContext("GET", "/chat/2/search?q=hola")
	h.HandlerSearchChat()(c)
	assert.Equal(t, http.StatusBadRequest, w.Code)
}

// ── Grupos ──────────────────────────────────────────────────────────────────

type stubGroupSearchService struct {
	services.GroupServicer
	page      *schemas.SearchPage
	err       error
	gotQ      string
	gotGroup  uint
	gotBefore uint
	gotLimit  int
}

func (s *stubGroupSearchService) SearchGroupMessages(telephon string, groupID uint, q string, before uint, limit int, ctx context.Context) (*schemas.SearchPage, error) {
	s.gotQ, s.gotGroup, s.gotBefore, s.gotLimit = q, groupID, before, limit
	return s.page, s.err
}

func runGroupSearch(stub *stubGroupSearchService, target string) *httptest.ResponseRecorder {
	h := &HandlerGroup{service: stub}
	c, w := newTestContext("GET", target)
	c.Set("telephon", "123")
	c.Set("groupID", uint(7))
	h.HandleSearchGroupMessages()(c)
	return w
}

func TestHandleSearchGroupMessages_OK(t *testing.T) {
	stub := &stubGroupSearchService{page: &schemas.SearchPage{Results: []schemas.SearchResult{}, HasMore: false}}
	w := runGroupSearch(stub, "/group/7/message/search?q=reunion&before=15&limit=5")

	assert.Equal(t, http.StatusOK, w.Code)
	assert.JSONEq(t, `{"results":[],"hasMore":false}`, w.Body.String())
	assert.Equal(t, "reunion", stub.gotQ)
	assert.Equal(t, uint(7), stub.gotGroup)
	assert.Equal(t, uint(15), stub.gotBefore)
	assert.Equal(t, 5, stub.gotLimit)
}

func TestHandleSearchGroupMessages_ErrorMapping(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want int
	}{
		{"no miembro", services.ErrNotGroupMember, http.StatusForbidden},
		{"consulta inválida", services.ErrInvalidSearchQuery, http.StatusBadRequest},
		{"error interno", errors.New("db"), http.StatusInternalServerError},
	}
	for _, tc := range cases {
		w := runGroupSearch(&stubGroupSearchService{err: tc.err}, "/group/7/message/search?q=zz")
		assert.Equal(t, tc.want, w.Code, tc.name)
	}
}

func TestHandleSearchGroupMessages_MissingContext(t *testing.T) {
	h := &HandlerGroup{service: &stubGroupSearchService{}}
	c, w := newTestContext("GET", "/group/7/message/search?q=zz")
	h.HandleSearchGroupMessages()(c)
	assert.Equal(t, http.StatusBadRequest, w.Code)
}

// ── Global ──────────────────────────────────────────────────────────────────

type stubSearchService struct {
	out         *schemas.GlobalSearchResponse
	err         error
	gotQ        string
	gotPerChat  int
	gotMaxChats int
	gotTelephon string
}

func (s *stubSearchService) SearchAll(telephon, q string, perChat, maxChats int, ctx context.Context) (*schemas.GlobalSearchResponse, error) {
	s.gotTelephon, s.gotQ, s.gotPerChat, s.gotMaxChats = telephon, q, perChat, maxChats
	return s.out, s.err
}

func runGlobalSearch(stub *stubSearchService, target string, withTelephon bool) *httptest.ResponseRecorder {
	h := InitHandlerSearch(stub)
	c, w := newTestContext("GET", target)
	if withTelephon {
		c.Set("telephon", "+1")
	}
	h.HandlerSearchAll()(c)
	return w
}

func TestHandlerSearchAll_OK(t *testing.T) {
	stub := &stubSearchService{out: &schemas.GlobalSearchResponse{Chats: []schemas.GlobalSearchChat{
		{Kind: "group", Key: "7", Name: "Equipo", Results: []schemas.SearchResult{}, Total: 0},
	}}}
	w := runGlobalSearch(stub, "/search?q=hola&limit=5&perChat=2", true)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.JSONEq(t, `{"chats":[{"kind":"group","key":"7","name":"Equipo","avatarUrl":"","results":[],"total":0}]}`, w.Body.String())
	assert.Equal(t, "+1", stub.gotTelephon)
	assert.Equal(t, "hola", stub.gotQ)
	assert.Equal(t, 5, stub.gotMaxChats)
	assert.Equal(t, 2, stub.gotPerChat)
}

func TestHandlerSearchAll_DefaultsWhenParamsMissingOrInvalid(t *testing.T) {
	stub := &stubSearchService{out: &schemas.GlobalSearchResponse{Chats: []schemas.GlobalSearchChat{}}}
	runGlobalSearch(stub, "/search?q=hola&limit=abc&perChat=-1", true)
	assert.Equal(t, 0, stub.gotMaxChats)
	assert.Equal(t, 0, stub.gotPerChat)
}

func TestHandlerSearchAll_ErrorMapping(t *testing.T) {
	assert.Equal(t, http.StatusBadRequest, runGlobalSearch(&stubSearchService{err: services.ErrInvalidSearchQuery}, "/search?q=a", true).Code)
	assert.Equal(t, http.StatusInternalServerError, runGlobalSearch(&stubSearchService{err: errors.New("db")}, "/search?q=hola", true).Code)
	assert.Equal(t, http.StatusBadRequest, runGlobalSearch(&stubSearchService{}, "/search?q=hola", false).Code)
}
