package handlers

import (
	"context"
	"encoding/json"
	"errors"
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

type stubReceiptsService struct {
	services.GroupServicer
	out                  *schemas.GroupMessageReceipts
	err                  error
	gotGroup, gotMessage uint
}

func (s *stubReceiptsService) GetGroupMessageReceipts(telephon string, groupID, messageID uint, ctx context.Context) (*schemas.GroupMessageReceipts, error) {
	s.gotGroup, s.gotMessage = groupID, messageID
	return s.out, s.err
}

func runGetReceipts(stub *stubReceiptsService, withMessageID bool) *httptest.ResponseRecorder {
	h := &HandlerGroup{service: stub}
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/group/7/message/9/receipts", nil)
	c.Set("telephon", "123")
	c.Set("groupID", uint(7))
	if withMessageID {
		c.Set("messageID", uint(9))
	}
	h.HandleGetMessageReceipts()(c)
	return w
}

func TestHandleGetMessageReceipts_OK(t *testing.T) {
	stub := &stubReceiptsService{out: &schemas.GroupMessageReceipts{
		ReadBy:      []schemas.GroupMemberBrief{{Telephon: "+1", Username: "ana"}},
		DeliveredTo: []schemas.GroupMemberBrief{},
		Pending:     []schemas.GroupMemberBrief{},
	}}
	w := runGetReceipts(stub, true)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, uint(7), stub.gotGroup)
	assert.Equal(t, uint(9), stub.gotMessage)
	assert.JSONEq(t, `{"readBy":[{"telephon":"+1","username":"ana"}],"deliveredTo":[],"pending":[]}`, w.Body.String())
}

func TestHandleGetMessageReceipts_ErrorMapping(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want int
	}{
		{"no autor", services.ErrNotMessageSender, http.StatusForbidden},
		{"no miembro", services.ErrNotGroupMember, http.StatusForbidden},
		{"mensaje inexistente", services.ErrGroupMessageNotFound, http.StatusNotFound},
		{"error interno", errors.New("boom"), http.StatusInternalServerError},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			w := runGetReceipts(&stubReceiptsService{err: c.err}, true)
			assert.Equal(t, c.want, w.Code)
		})
	}
}

func TestHandleGetMessageReceipts_MissingContextIs400(t *testing.T) {
	w := runGetReceipts(&stubReceiptsService{}, false)
	assert.Equal(t, http.StatusBadRequest, w.Code)
}
