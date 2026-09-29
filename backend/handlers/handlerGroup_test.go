package handlers

import (
	"context"
	"encoding/json"
	"gorm/backend/schemas"
	"gorm/backend/services"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

// stubGroupService solo implementa GetGroupMessagesPage; el resto entra por la
// interfaz embebida (nil) y no debe invocarse en estos tests.
type stubGroupService struct {
	services.GroupServicer
	gotBefore  uint
	gotLimit   int
	gotOffset  int
	returnMsgs []schemas.GroupMessageResponse
	hasMore    bool
}

func (s *stubGroupService) GetGroupMessagesPage(telephon string, groupID, before uint, limit, offset int, ctx context.Context) ([]schemas.GroupMessageResponse, bool, error) {
	s.gotBefore, s.gotLimit, s.gotOffset = before, limit, offset
	return s.returnMsgs, s.hasMore, nil
}

func runGetGroupMessages(t *testing.T, stub *stubGroupService, query string) (*httptest.ResponseRecorder, map[string]json.RawMessage) {
	t.Helper()
	h := &HandlerGroup{service: stub}
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/group/7/message"+query, nil)
	c.Set("telephon", "123")
	c.Set("groupID", uint(7))
	h.HandleGetGroupMessages()(c)
	var body map[string]json.RawMessage
	_ = json.Unmarshal(w.Body.Bytes(), &body)
	return w, body
}

func TestHandleGetGroupMessages_DefaultsAndHasMore(t *testing.T) {
	stub := &stubGroupService{returnMsgs: []schemas.GroupMessageResponse{{MessageID: 3}}, hasMore: true}

	w, body := runGetGroupMessages(t, stub, "")

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, uint(0), stub.gotBefore)
	assert.Equal(t, 50, stub.gotLimit)
	assert.Equal(t, 0, stub.gotOffset)
	assert.JSONEq(t, "true", string(body["hasMore"]))
	assert.Contains(t, body, "messages")
}

func TestHandleGetGroupMessages_ParsesBefore(t *testing.T) {
	stub := &stubGroupService{returnMsgs: []schemas.GroupMessageResponse{}}

	_, body := runGetGroupMessages(t, stub, "?before=42&limit=20")

	assert.Equal(t, uint(42), stub.gotBefore)
	assert.Equal(t, 20, stub.gotLimit)
	assert.JSONEq(t, "false", string(body["hasMore"]))
}

func TestHandleGetGroupMessages_InvalidBeforeIgnored(t *testing.T) {
	stub := &stubGroupService{returnMsgs: []schemas.GroupMessageResponse{}}

	runGetGroupMessages(t, stub, "?before=abc")
	assert.Equal(t, uint(0), stub.gotBefore)
	runGetGroupMessages(t, stub, "?before=-5")
	assert.Equal(t, uint(0), stub.gotBefore)
}
