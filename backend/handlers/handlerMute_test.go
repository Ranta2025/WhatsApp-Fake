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
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

const muteTestTel = "+51999000111"

func muteCtx(method string, sets map[string]any) (*httptest.ResponseRecorder, *gin.Context) {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(method, "/mute", nil)
	for k, v := range sets {
		c.Set(k, v)
	}
	return w, c
}

var (
	directTarget = services.MuteTarget{Kind: models.ChatKindDirect, Telephon: "+51999000222"}
	groupTarget  = services.MuteTarget{Kind: models.ChatKindGroup, GroupID: 7}
)

func directMuteSets(extra map[string]any) map[string]any {
	m := map[string]any{"telephon": muteTestTel, "contact": "+51999000222"}
	for k, v := range extra {
		m[k] = v
	}
	return m
}

func groupMuteSets(extra map[string]any) map[string]any {
	m := map[string]any{"telephon": muteTestTel, "groupID": uint(7)}
	for k, v := range extra {
		m[k] = v
	}
	return m
}

func TestHandlerMuteSetTimedReturnsMutedUntil(t *testing.T) {
	until := time.Date(2026, 10, 4, 20, 0, 0, 0, time.UTC)
	svc := new(MockMuteService)
	svc.On("SetMute", muteTestTel, directTarget, "8h", mock.Anything).Return(schemas.MuteResponse{Muted: true, MutedUntil: &until}, nil)
	w, c := muteCtx("PUT", directMuteSets(map[string]any{"muteDuration": "8h"}))

	InitHandlerMute(svc).HandlerSetMute(models.ChatKindDirect)(c)

	require.Equal(t, http.StatusOK, w.Code)
	assert.JSONEq(t, `{"muted":true,"mutedUntil":"2026-10-04T20:00:00Z"}`, w.Body.String())
}

func TestHandlerMuteSetAlwaysReturnsNull(t *testing.T) {
	svc := new(MockMuteService)
	svc.On("SetMute", muteTestTel, groupTarget, "always", mock.Anything).Return(schemas.MuteResponse{Muted: true}, nil)
	w, c := muteCtx("PUT", groupMuteSets(map[string]any{"muteDuration": "always"}))

	InitHandlerMute(svc).HandlerSetMute(models.ChatKindGroup)(c)

	require.Equal(t, http.StatusOK, w.Code)
	assert.JSONEq(t, `{"muted":true,"mutedUntil":null}`, w.Body.String())
}

func TestHandlerMuteErrorStatuses(t *testing.T) {
	cases := []struct {
		err    error
		status int
	}{
		{services.ErrMuteInvalidDuration, http.StatusBadRequest},
		{services.ErrMuteChatNotFound, http.StatusNotFound},
		{services.ErrNotGroupMember, http.StatusForbidden},
		{errors.New("db password=secret"), http.StatusInternalServerError},
	}
	for _, tc := range cases {
		svc := new(MockMuteService)
		svc.On("SetMute", mock.Anything, mock.Anything, mock.Anything, mock.Anything).Return(schemas.MuteResponse{}, tc.err)
		svc.On("ClearMute", mock.Anything, mock.Anything, mock.Anything).Return(tc.err)
		h := InitHandlerMute(svc)

		w, c := muteCtx("PUT", groupMuteSets(map[string]any{"muteDuration": "x"}))
		h.HandlerSetMute(models.ChatKindGroup)(c)
		assert.Equal(t, tc.status, w.Code, "PUT %v", tc.err)
		assert.NotContains(t, w.Body.String(), "secret")

		w, c = muteCtx("DELETE", directMuteSets(nil))
		h.HandlerClearMute(models.ChatKindDirect)(c)
		assert.Equal(t, tc.status, w.Code, "DELETE %v", tc.err)
	}
}

func TestHandlerMuteClearNoContent(t *testing.T) {
	svc := new(MockMuteService)
	svc.On("ClearMute", muteTestTel, groupTarget, mock.Anything).Return(nil)
	svc.On("ClearMute", muteTestTel, directTarget, mock.Anything).Return(nil)
	h := InitHandlerMute(svc)

	w, c := muteCtx("DELETE", groupMuteSets(nil))
	h.HandlerClearMute(models.ChatKindGroup)(c)
	assert.Equal(t, http.StatusNoContent, w.Code)
	assert.Empty(t, w.Body.String())

	w, c = muteCtx("DELETE", directMuteSets(nil))
	h.HandlerClearMute(models.ChatKindDirect)(c)
	assert.Equal(t, http.StatusNoContent, w.Code)
	svc.AssertExpectations(t)
}

func TestHandlerMuteMissingContext(t *testing.T) {
	h := InitHandlerMute(new(MockMuteService))
	for _, sets := range []map[string]any{
		nil,
		{"telephon": muteTestTel}, // sin destino
		{"telephon": muteTestTel, "contact": "+51999000222"}, // sin duración
	} {
		w, c := muteCtx("PUT", sets)
		h.HandlerSetMute(models.ChatKindDirect)(c)
		assert.Equal(t, http.StatusBadRequest, w.Code, "%v", sets)
	}
	w, c := muteCtx("DELETE", map[string]any{"telephon": muteTestTel})
	h.HandlerClearMute(models.ChatKindGroup)(c)
	assert.Equal(t, http.StatusBadRequest, w.Code)
}

// ─────────────────────────────────────────────────────────────────────────────
// Estado de silencio en los listados
// ─────────────────────────────────────────────────────────────────────────────

func TestHandlerGetAllChatsCarriesMuteFields(t *testing.T) {
	until := time.Date(2026, 10, 4, 20, 0, 0, 0, time.UTC)
	chats := []schemas.ChatGroup{{ContactTelephon: "+2"}, {ContactTelephon: "+3"}, {ContactTelephon: "+4"}}
	svc := new(MockChatService)
	svc.On("ServiceGetAllChats", muteTestTel, mock.Anything).Return(chats, nil)
	mutes := new(MockMuteService)
	mutes.On("DecorateChats", muteTestTel, mock.Anything, mock.Anything).Run(func(a mock.Arguments) {
		cs := a.Get(1).([]schemas.ChatGroup)
		cs[0].Muted, cs[0].MutedUntil = true, &until
		cs[1].Muted = true
	}).Return(nil)
	h := &HandlerChat{service: svc}
	h.SetMuteService(mutes)
	w, c := muteCtx("GET", map[string]any{"telephon": muteTestTel})

	h.HandlerGetAllChats()(c)

	require.Equal(t, http.StatusOK, w.Code)
	var got []map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &got))
	require.Len(t, got, 3)
	assert.Equal(t, true, got[0]["muted"])
	assert.Equal(t, "2026-10-04T20:00:00Z", got[0]["mutedUntil"])
	assert.Equal(t, true, got[1]["muted"])
	assert.NotContains(t, got[1], "mutedUntil", "para siempre: sin vencimiento")
	assert.NotContains(t, got[2], "muted")
	assert.NotContains(t, got[2], "mutedUntil")
}

// Si falla la consulta de silencios el listado sale igual (sin estado).
func TestHandlerListsSurviveMuteErrors(t *testing.T) {
	mutes := new(MockMuteService)
	mutes.On("DecorateChats", mock.Anything, mock.Anything, mock.Anything).Return(errors.New("db"))
	mutes.On("DecorateContacts", mock.Anything, mock.Anything, mock.Anything).Return(errors.New("db"))
	mutes.On("DecorateGroups", mock.Anything, mock.Anything, mock.Anything).Return(errors.New("db"))

	chatSvc := new(MockChatService)
	chatSvc.On("ServiceGetAllChats", muteTestTel, mock.Anything).Return([]schemas.ChatGroup{{ContactTelephon: "+2"}}, nil)
	hc := &HandlerChat{service: chatSvc}
	hc.SetMuteService(mutes)
	w, c := muteCtx("GET", map[string]any{"telephon": muteTestTel})
	hc.HandlerGetAllChats()(c)
	assert.Equal(t, http.StatusOK, w.Code)

	contactSvc := new(MockContactService)
	contactSvc.On("ServiceGetContactsByTelephon", muteTestTel, mock.Anything).Return(&[]models.ContactChat{{Number: "+2"}}, nil)
	hk := InitHandlerApiMessage(contactSvc, nil)
	hk.SetMuteService(mutes)
	w, c = muteCtx("GET", map[string]any{"telephon": muteTestTel})
	hk.HandlerContacts()(c)
	assert.Equal(t, http.StatusOK, w.Code)

	hg := &HandlerGroup{service: &listGroupService{groups: []schemas.GroupResponse{{ID: 7}}}}
	hg.SetMuteService(mutes)
	w, c = muteCtx("GET", map[string]any{"telephon": muteTestTel})
	hg.HandleGetUserGroups()(c)
	assert.Equal(t, http.StatusOK, w.Code)
}

func TestHandlerContactsCarriesMuteFields(t *testing.T) {
	contactSvc := new(MockContactService)
	contactSvc.On("ServiceGetContactsByTelephon", muteTestTel, mock.Anything).Return(&[]models.ContactChat{{Number: "+2"}, {Number: "+3"}}, nil)
	mutes := new(MockMuteService)
	mutes.On("DecorateContacts", muteTestTel, mock.Anything, mock.Anything).Run(func(a mock.Arguments) {
		a.Get(1).([]models.ContactChat)[0].Muted = true
	}).Return(nil)
	h := InitHandlerApiMessage(contactSvc, nil)
	h.SetMuteService(mutes)
	w, c := muteCtx("GET", map[string]any{"telephon": muteTestTel})

	h.HandlerContacts()(c)

	require.Equal(t, http.StatusOK, w.Code)
	var got []map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &got))
	require.Len(t, got, 2)
	assert.Equal(t, true, got[0]["muted"])
	assert.NotContains(t, got[0], "mutedUntil")
	assert.NotContains(t, got[1], "muted")
}

type listGroupService struct {
	services.GroupServicer
	groups []schemas.GroupResponse
}

func (s *listGroupService) GetUserGroups(string, context.Context) ([]schemas.GroupResponse, error) {
	return s.groups, nil
}

func TestHandlerGetUserGroupsCarriesMuteFields(t *testing.T) {
	until := time.Date(2026, 10, 11, 12, 0, 0, 0, time.UTC)
	mutes := new(MockMuteService)
	mutes.On("DecorateGroups", muteTestTel, mock.Anything, mock.Anything).Run(func(a mock.Arguments) {
		a.Get(1).([]schemas.GroupResponse)[1].Muted = true
		a.Get(1).([]schemas.GroupResponse)[1].MutedUntil = &until
	}).Return(nil)
	h := &HandlerGroup{service: &listGroupService{groups: []schemas.GroupResponse{{ID: 7}, {ID: 8}}}}
	h.SetMuteService(mutes)
	w, c := muteCtx("GET", map[string]any{"telephon": muteTestTel})

	h.HandleGetUserGroups()(c)

	require.Equal(t, http.StatusOK, w.Code)
	var got struct {
		Groups []map[string]any `json:"groups"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &got))
	require.Len(t, got.Groups, 2)
	assert.NotContains(t, got.Groups[0], "muted")
	assert.Equal(t, true, got.Groups[1]["muted"])
	assert.Equal(t, "2026-10-11T12:00:00Z", got.Groups[1]["mutedUntil"])
}

// Sin servicio de silencios (tests antiguos / wiring parcial) los listados no cambian.
func TestHandlerListsWithoutMuteService(t *testing.T) {
	chatSvc := new(MockChatService)
	chatSvc.On("ServiceGetAllChats", muteTestTel, mock.Anything).Return([]schemas.ChatGroup{{ContactTelephon: "+2"}}, nil)
	w, c := muteCtx("GET", map[string]any{"telephon": muteTestTel})
	(&HandlerChat{service: chatSvc}).HandlerGetAllChats()(c)
	require.Equal(t, http.StatusOK, w.Code)
	assert.NotContains(t, w.Body.String(), "Muted")
}
