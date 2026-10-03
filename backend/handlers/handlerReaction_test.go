package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"gorm/backend/models"
	"gorm/backend/services"
	"gorm/backend/websocket"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type stubReactionService struct {
	change *services.ReactionChange
	list   []models.ReactionUsers
	err    error

	gotTelephon, gotKind, gotEmoji string
	gotMessageID, gotGroupID       uint
}

func (s *stubReactionService) React(telephon, kind string, messageID, groupID uint, emoji string, _ context.Context) (*services.ReactionChange, error) {
	s.gotTelephon, s.gotKind, s.gotMessageID, s.gotGroupID, s.gotEmoji = telephon, kind, messageID, groupID, emoji
	return s.change, s.err
}

func (s *stubReactionService) ListReactionsFor(telephon, kind string, messageID, groupID uint, _ context.Context) ([]models.ReactionUsers, error) {
	s.gotTelephon, s.gotKind, s.gotMessageID, s.gotGroupID = telephon, kind, messageID, groupID
	return s.list, s.err
}

type reactionRig struct {
	h     *HandlerReaction
	stub  *stubReactionService
	other *websocket.Client
	actor *websocket.Client
}

func newReactionRig() *reactionRig {
	hub := websocket.NewHub(nil, nil)
	actor := websocket.NewClient("ana", "+1", nil)
	other := websocket.NewClient("luis", "+2", nil)
	hub.RegisterClient(actor)
	hub.RegisterClient(other)
	stub := &stubReactionService{}
	return &reactionRig{h: InitHandlerReaction(stub, hub), stub: stub, other: other, actor: actor}
}

func received(c *websocket.Client) int {
	n := 0
	for {
		select {
		case <-c.Send:
			n++
		case <-time.After(20 * time.Millisecond):
			return n
		}
	}
}

func runReaction(h gin.HandlerFunc, method, body string, groupID uint) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(method, "/x", strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("telephon", "+1")
	c.Set("messageID", uint(10))
	if groupID != 0 {
		c.Set("groupID", groupID)
	}
	h(c)
	return w
}

func directChange(changed bool, emoji string) *services.ReactionChange {
	return &services.ReactionChange{
		Kind: models.ReactionKindDirect, MessageID: 10, Emoji: emoji, Changed: changed,
		ActorTelephon: "+1", ActorUsername: "ana", AuthorTelephon: "+2", OtherTelephon: "+2", Preview: "hola",
	}
}

func TestSetReaction_Direct_OKBroadcasts(t *testing.T) {
	rig := newReactionRig()
	rig.stub.change = directChange(true, "👍")

	w := runReaction(rig.h.HandlerSetReaction(models.ReactionKindDirect), "PUT", `{"emoji":"👍"}`, 0)

	require.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "+1", rig.stub.gotTelephon)
	assert.Equal(t, models.ReactionKindDirect, rig.stub.gotKind)
	assert.Equal(t, uint(10), rig.stub.gotMessageID)
	assert.Equal(t, "👍", rig.stub.gotEmoji)
	var body map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	assert.Equal(t, "👍", body["emoji"])
	assert.Equal(t, true, body["changed"])
	assert.Equal(t, 1, received(rig.other), "REST también difunde el evento por WS")
	assert.Equal(t, 1, received(rig.actor))
}

func TestSetReaction_Group_PassesGroupID(t *testing.T) {
	rig := newReactionRig()
	rig.stub.change = directChange(true, "🙏")
	rig.stub.change.Kind, rig.stub.change.GroupID = models.ReactionKindGroup, 7

	w := runReaction(rig.h.HandlerSetReaction(models.ReactionKindGroup), "PUT", `{"emoji":"🙏"}`, 7)

	require.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, uint(7), rig.stub.gotGroupID)
	assert.Equal(t, models.ReactionKindGroup, rig.stub.gotKind)
}

func TestSetReaction_BodyValidation(t *testing.T) {
	for name, body := range map[string]string{
		"not json": `nope`, "missing emoji": `{}`, "empty emoji": `{"emoji":""}`,
	} {
		t.Run(name, func(t *testing.T) {
			rig := newReactionRig()
			w := runReaction(rig.h.HandlerSetReaction(models.ReactionKindDirect), "PUT", body, 0)
			assert.Equal(t, http.StatusBadRequest, w.Code)
			assert.Empty(t, rig.stub.gotKind, "no debe llegar al servicio")
		})
	}
}

func TestRemoveReaction_SendsEmptyEmoji(t *testing.T) {
	rig := newReactionRig()
	rig.stub.change = directChange(true, "")

	w := runReaction(rig.h.HandlerRemoveReaction(models.ReactionKindDirect), "DELETE", ``, 0)

	require.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "", rig.stub.gotEmoji)
	assert.Equal(t, 1, received(rig.other))
}

func TestRemoveReaction_NoOpDoesNotBroadcast(t *testing.T) {
	rig := newReactionRig()
	rig.stub.change = directChange(false, "")

	w := runReaction(rig.h.HandlerRemoveReaction(models.ReactionKindDirect), "DELETE", ``, 0)

	require.Equal(t, http.StatusOK, w.Code)
	var body map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	assert.Equal(t, false, body["changed"])
	assert.Equal(t, 0, received(rig.other))
	assert.Equal(t, 0, received(rig.actor))
}

func TestReaction_StatusMapping(t *testing.T) {
	cases := map[string]struct {
		err  error
		code int
	}{
		"invalid emoji": {services.ErrInvalidReactionEmoji, http.StatusBadRequest},
		"invalid kind":  {services.ErrInvalidReactionKind, http.StatusBadRequest},
		"rate limited":  {services.ErrReactionRateLimited, http.StatusTooManyRequests},
		"not member":    {services.ErrNotGroupMember, http.StatusForbidden},
		"direct 404":    {models.ErrMessageNotFound, http.StatusNotFound},
		"group msg 404": {services.ErrGroupMessageNotFound, http.StatusNotFound},
		"internal":      {errors.New("boom"), http.StatusInternalServerError},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			rig := newReactionRig()
			rig.stub.err = c.err
			assert.Equal(t, c.code, runReaction(rig.h.HandlerSetReaction(models.ReactionKindGroup), "PUT", `{"emoji":"👍"}`, 7).Code)
			assert.Equal(t, c.code, runReaction(rig.h.HandlerRemoveReaction(models.ReactionKindGroup), "DELETE", ``, 7).Code)
			assert.Equal(t, c.code, runReaction(rig.h.HandlerListReactions(models.ReactionKindGroup), "GET", ``, 7).Code)
			assert.Equal(t, 0, received(rig.other), "los errores no difunden")
		})
	}
}

func TestListReactions_Shape(t *testing.T) {
	rig := newReactionRig()
	rig.stub.list = []models.ReactionUsers{{Emoji: "👍", Users: []models.ReactionUser{{Telephon: "+1", Username: "ana", AvatarUrl: "/a.png"}}}}

	w := runReaction(rig.h.HandlerListReactions(models.ReactionKindDirect), "GET", ``, 0)

	require.Equal(t, http.StatusOK, w.Code)
	assert.JSONEq(t, `{"reactions":[{"emoji":"👍","users":[{"telephon":"+1","username":"ana","avatarUrl":"/a.png"}]}]}`, w.Body.String())
}

func TestListReactions_EmptyIsEmptyArray(t *testing.T) {
	rig := newReactionRig()
	w := runReaction(rig.h.HandlerListReactions(models.ReactionKindDirect), "GET", ``, 0)
	assert.JSONEq(t, `{"reactions":[]}`, w.Body.String())
}

func TestReaction_MissingContextIsBadRequest(t *testing.T) {
	rig := newReactionRig()
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/x", nil)
	rig.h.HandlerListReactions(models.ReactionKindDirect)(c)
	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestReaction_InvalidContextValuesAreBadRequest(t *testing.T) {
	cases := map[string]struct {
		telephon  any
		messageID any
	}{
		"wrong telephon type": {telephon: 42, messageID: uint(7)},
		"empty telephon":      {telephon: "", messageID: uint(7)},
		"wrong message type":  {telephon: "+1", messageID: "7"},
		"zero message id":     {telephon: "+1", messageID: uint(0)},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			rig := newReactionRig()
			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)
			c.Request = httptest.NewRequest("GET", "/x", nil)
			c.Set("telephon", tc.telephon)
			c.Set("messageID", tc.messageID)
			rig.h.HandlerListReactions(models.ReactionKindDirect)(c)
			assert.Equal(t, http.StatusBadRequest, w.Code)
			assert.NotEmpty(t, w.Body.String())
		})
	}
}
