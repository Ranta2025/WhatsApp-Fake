package handlers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"gorm/backend/middleware"
	"gorm/backend/models"
	"gorm/backend/schemas"
	"gorm/backend/services"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ─────────────────────────────────────────────────────────────────────────────
// PW8: REST group send with clientID. A duplicate answers 200 with the stored
// message and is not broadcast again; a fresh send keeps 201 + broadcast.
// ─────────────────────────────────────────────────────────────────────────────

const restTestClientID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301"

type idemGroupService struct {
	services.GroupServicer
	got       models.GroupMessageSend
	duplicate bool
	err       error
}

func (s *idemGroupService) SendGroupMessage(_ string, d models.GroupMessageSend, _ context.Context) (*schemas.GroupMessageResponse, error) {
	s.got = d
	if s.err != nil {
		return nil, s.err
	}
	cid := d.ClientID
	return &schemas.GroupMessageResponse{MessageID: 88, GroupID: d.GroupID, ClientID: &cid, Duplicate: s.duplicate}, nil
}

type recordingGroupNotifier struct {
	fakeNotifier
	groupSends int
}

func (r *recordingGroupNotifier) SendToGroup(uint, string, []byte) { r.groupSends++ }

// runIdemGroupSend goes through the real middleware so the JSON field name is
// exercised end to end.
func runIdemGroupSend(t *testing.T, svc services.GroupServicer, n GroupHubNotifier, body string) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	h := InitHandlerGroup(svc, n, nil)
	r := gin.New()
	r.POST("/group/:groupID/message", func(c *gin.Context) {
		c.Set("telephon", "+1")
		c.Set("groupID", uint(7))
		c.Next()
	}, middleware.MiddlewareGroupMessage(), h.HandleSendGroupMessage())
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/group/7/message", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	return w
}

func TestHandleSendGroupMessage_ParsesClientIDAndBroadcastsFirstSend(t *testing.T) {
	svc := &idemGroupService{}
	n := &recordingGroupNotifier{}

	w := runIdemGroupSend(t, svc, n, `{"groupID":7,"message":"hola","clientID":"`+restTestClientID+`"}`)

	require.Equal(t, http.StatusCreated, w.Code)
	assert.Equal(t, restTestClientID, svc.got.ClientID)
	assert.Equal(t, 1, n.groupSends)
	assert.Contains(t, w.Body.String(), `"ClientID":"`+restTestClientID+`"`)
}

func TestHandleSendGroupMessage_DuplicateReturns200WithoutBroadcast(t *testing.T) {
	svc := &idemGroupService{duplicate: true}
	n := &recordingGroupNotifier{}

	w := runIdemGroupSend(t, svc, n, `{"groupID":7,"message":"hola","clientID":"`+restTestClientID+`"}`)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, 0, n.groupSends)
	assert.Contains(t, w.Body.String(), `"MessageID":88`)
}

func TestHandleSendGroupMessage_InvalidClientIDIs400(t *testing.T) {
	svc := &idemGroupService{err: services.ErrInvalidClientID}
	n := &recordingGroupNotifier{}

	w := runIdemGroupSend(t, svc, n, `{"groupID":7,"message":"hola","clientID":"nope"}`)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Equal(t, 0, n.groupSends)
}

func TestHandleSendGroupMessage_ClientIDConflictIs409(t *testing.T) {
	svc := &idemGroupService{err: services.ErrClientIDConflict}

	w := runIdemGroupSend(t, svc, &recordingGroupNotifier{}, `{"groupID":7,"message":"hola","clientID":"`+restTestClientID+`"}`)

	assert.Equal(t, http.StatusConflict, w.Code)
}

func TestChatErrorStatus_ClientIDErrors(t *testing.T) {
	assert.Equal(t, http.StatusBadRequest, chatErrorStatus(services.ErrInvalidClientID))
	assert.Equal(t, http.StatusConflict, chatErrorStatus(services.ErrClientIDConflict))
}
