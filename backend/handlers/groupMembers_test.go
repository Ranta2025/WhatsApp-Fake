package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"gorm/backend/models"
	"gorm/backend/schemas"
	"gorm/backend/services"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ─────────────────────────────────────────────────────────────────────────────
// Stubs: servicio de grupos y notificador del hub
// ─────────────────────────────────────────────────────────────────────────────

type stubMemberService struct {
	services.GroupServicer

	roleResult     *schemas.GroupMessageResponse
	roleErr        error
	removeResult   *schemas.GroupMessageResponse
	removeErr      error
	settingsResult *schemas.GroupSettingsResult
	settingsErr    error
	infoResult     *schemas.GroupInfoResult
	infoErr        error
	addResult      []schemas.GroupMemberBrief
	addSystem      *schemas.GroupMessageResponse
	addErr         error
	leaveSystem    *schemas.GroupMessageResponse
	leaveErr       error
	memberTel      []string
	telephonsErr   error
	username       string
	detail         *schemas.GroupDetail

	gotPromote  bool
	gotDismiss  bool
	gotRemove   string
	gotSettings models.GroupSettingsUpdate
	gotInfo     models.GroupInfoUpdate
}

func (s *stubMemberService) Promote(actor string, groupID uint, target string, ctx context.Context) (*schemas.GroupMessageResponse, error) {
	s.gotPromote = true
	return s.roleResult, s.roleErr
}
func (s *stubMemberService) Dismiss(actor string, groupID uint, target string, ctx context.Context) (*schemas.GroupMessageResponse, error) {
	s.gotDismiss = true
	return s.roleResult, s.roleErr
}
func (s *stubMemberService) Remove(actor string, groupID uint, target string, ctx context.Context) (*schemas.GroupMessageResponse, error) {
	s.gotRemove = target
	return s.removeResult, s.removeErr
}
func (s *stubMemberService) UpdateSettings(actor string, groupID uint, data models.GroupSettingsUpdate, ctx context.Context) (*schemas.GroupSettingsResult, error) {
	s.gotSettings = data
	return s.settingsResult, s.settingsErr
}
func (s *stubMemberService) UpdateInfo(actor string, groupID uint, data models.GroupInfoUpdate, ctx context.Context) (*schemas.GroupInfoResult, error) {
	s.gotInfo = data
	return s.infoResult, s.infoErr
}
func (s *stubMemberService) GetMemberTelephons(groupID uint, ctx context.Context) ([]string, error) {
	return s.memberTel, s.telephonsErr
}
func (s *stubMemberService) GetUsernameByTelephon(telephon string, ctx context.Context) (string, error) {
	return s.username, nil
}
func (s *stubMemberService) GetGroupDetail(telephon string, groupID uint, ctx context.Context) (*schemas.GroupDetail, error) {
	return s.detail, nil
}
func (s *stubMemberService) AddMembers(telephon string, groupID uint, data models.GroupAddMembers, ctx context.Context) ([]schemas.GroupMemberBrief, *schemas.GroupMessageResponse, error) {
	return s.addResult, s.addSystem, s.addErr
}
func (s *stubMemberService) LeaveGroup(telephon string, groupID uint, ctx context.Context) (*schemas.GroupMessageResponse, error) {
	return s.leaveSystem, s.leaveErr
}

type sentMsg struct {
	telephon string
	payload  map[string]interface{}
	wsType   string
}

type fakeNotifier struct {
	sent      []sentMsg
	leftRooms []struct {
		groupID  uint
		telephon string
	}
}

func (f *fakeNotifier) SendTo(telephon string, msg []byte) {
	var env struct {
		Type    string                 `json:"type"`
		Payload map[string]interface{} `json:"payload"`
	}
	_ = json.Unmarshal(msg, &env)
	f.sent = append(f.sent, sentMsg{telephon: telephon, payload: env.Payload, wsType: env.Type})
}
func (f *fakeNotifier) JoinRoomByTelephon(groupID uint, telephon string) {}
func (f *fakeNotifier) LeaveRoomByTelephon(groupID uint, telephon string) {
	f.leftRooms = append(f.leftRooms, struct {
		groupID  uint
		telephon string
	}{groupID, telephon})
}
func (f *fakeNotifier) SendToGroup(groupID uint, sender string, msg []byte) {}

// findEvent devuelve el primer evento del tipo indicado enviado a un teléfono.
func findEvent(f *fakeNotifier, wsType, to string) (map[string]interface{}, bool) {
	for _, s := range f.sent {
		if s.wsType == wsType && s.telephon == to {
			return s.payload, true
		}
	}
	return nil, false
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT /:groupID/members/:telephon/role
// ─────────────────────────────────────────────────────────────────────────────

func runChangeRole(t *testing.T, stub *stubMemberService, notifier *fakeNotifier, role string) *httptest.ResponseRecorder {
	t.Helper()
	h := &HandlerGroup{service: stub, notifier: notifier}
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("PUT", "/group/7/members/+2/role", nil)
	c.Set("telephon", "+1")
	c.Set("groupID", uint(7))
	c.Set("groupTelephon", "+2")
	c.Set("groupMemberRole", models.GroupMemberRoleUpdate{Role: role})
	h.HandleChangeMemberRole()(c)
	return w
}

func TestHandleChangeMemberRole_Promote(t *testing.T) {
	sys := &schemas.GroupMessageResponse{MessageID: 5, Kind: models.GroupMessageKindSystem, SystemEvent: models.SystemEventAdminGranted}
	stub := &stubMemberService{roleResult: sys, memberTel: []string{"+1", "+2", "+3"}}
	notifier := &fakeNotifier{}

	w := runChangeRole(t, stub, notifier, models.GroupRoleAdmin)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.True(t, stub.gotPromote)
	assert.False(t, stub.gotDismiss)
	payload, ok := findEvent(notifier, "group_member_role", "+3")
	require.True(t, ok, "evento group_member_role emitido")
	assert.Equal(t, "+2", payload["telephon"])
	assert.Equal(t, models.GroupRoleAdmin, payload["role"])
	assert.NotNil(t, payload["systemMessage"])
}

func TestHandleChangeMemberRole_Dismiss(t *testing.T) {
	stub := &stubMemberService{roleResult: &schemas.GroupMessageResponse{MessageID: 6}, memberTel: []string{"+1", "+2"}}
	notifier := &fakeNotifier{}

	w := runChangeRole(t, stub, notifier, models.GroupRoleMember)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.True(t, stub.gotDismiss)
	assert.False(t, stub.gotPromote)
}

func TestHandleChangeMemberRole_ErrorMapping(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want int
	}{
		{"no admin", services.ErrNotGroupAdmin, http.StatusForbidden},
		{"no miembro", services.ErrNotGroupMember, http.StatusForbidden},
		{"objetivo no miembro", services.ErrGroupTargetNotMember, http.StatusNotFound},
		{"cambio inválido", services.ErrInvalidRoleChange, http.StatusBadRequest},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			stub := &stubMemberService{roleErr: tc.err}
			notifier := &fakeNotifier{}
			w := runChangeRole(t, stub, notifier, models.GroupRoleAdmin)
			assert.Equal(t, tc.want, w.Code)
			assert.Empty(t, notifier.sent, "no se difunde nada si falla")
		})
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /:groupID/members/:telephon
// ─────────────────────────────────────────────────────────────────────────────

func TestHandleRemoveMember(t *testing.T) {
	sys := &schemas.GroupMessageResponse{MessageID: 9, Kind: models.GroupMessageKindSystem, SystemEvent: models.SystemEventMemberRemoved}
	stub := &stubMemberService{removeResult: sys, username: "luis", memberTel: []string{"+1", "+3"}}
	notifier := &fakeNotifier{}

	h := &HandlerGroup{service: stub, notifier: notifier}
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("DELETE", "/group/7/members/+2", nil)
	c.Set("telephon", "+1")
	c.Set("groupID", uint(7))
	c.Set("groupTelephon", "+2")
	h.HandleRemoveMember()(c)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "+2", stub.gotRemove)
	require.Len(t, notifier.leftRooms, 1, "el removido sale de la room")
	assert.Equal(t, uint(7), notifier.leftRooms[0].groupID)
	assert.Equal(t, "+2", notifier.leftRooms[0].telephon)

	// El removido también recibe el evento (para pasar a estado left).
	payload, ok := findEvent(notifier, "group_member_removed", "+2")
	require.True(t, ok, "el removido recibe group_member_removed")
	assert.Equal(t, "+2", payload["telephon"])
	assert.Equal(t, "luis", payload["username"])
	assert.Equal(t, float64(2), payload["newMemberCount"])
	assert.NotNil(t, payload["systemMessage"])
}

func TestHandleRemoveMember_ErrorMapping(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want int
	}{
		{"no admin", services.ErrNotGroupAdmin, http.StatusForbidden},
		{"auto remoción", services.ErrInvalidRoleChange, http.StatusBadRequest},
		{"objetivo no miembro", services.ErrGroupTargetNotMember, http.StatusNotFound},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			stub := &stubMemberService{removeErr: tc.err}
			notifier := &fakeNotifier{}
			h := &HandlerGroup{service: stub, notifier: notifier}
			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)
			c.Request = httptest.NewRequest("DELETE", "/group/7/members/+2", nil)
			c.Set("telephon", "+1")
			c.Set("groupID", uint(7))
			c.Set("groupTelephon", "+2")
			h.HandleRemoveMember()(c)

			assert.Equal(t, tc.want, w.Code)
			assert.Empty(t, notifier.leftRooms, "sin efectos laterales si falla")
			assert.Empty(t, notifier.sent)
		})
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /:groupID/settings y PATCH /:groupID
// ─────────────────────────────────────────────────────────────────────────────

func TestHandleUpdateGroupSettings_Broadcasts(t *testing.T) {
	only := true
	res := &schemas.GroupSettingsResult{GroupID: 7, OnlyAdminsCanSend: true, SystemMessage: &schemas.GroupMessageResponse{MessageID: 3}}
	stub := &stubMemberService{settingsResult: res, memberTel: []string{"+1", "+2"}}
	notifier := &fakeNotifier{}

	h := &HandlerGroup{service: stub, notifier: notifier}
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("PATCH", "/group/7/settings", nil)
	c.Set("telephon", "+1")
	c.Set("groupID", uint(7))
	c.Set("groupSettings", models.GroupSettingsUpdate{OnlyAdminsCanSend: &only})
	h.HandleUpdateGroupSettings()(c)

	assert.Equal(t, http.StatusOK, w.Code)
	payload, ok := findEvent(notifier, "group_settings", "+2")
	require.True(t, ok)
	assert.Equal(t, true, payload["onlyAdminsCanSend"])
	assert.NotNil(t, payload["systemMessage"])
}

func TestHandleUpdateGroupInfo_Broadcasts(t *testing.T) {
	res := &schemas.GroupInfoResult{GroupID: 7, Name: "Nuevo", Description: "desc", SystemMessage: &schemas.GroupMessageResponse{MessageID: 4}}
	stub := &stubMemberService{infoResult: res, memberTel: []string{"+1", "+2"}}
	notifier := &fakeNotifier{}
	name := "Nuevo"

	h := &HandlerGroup{service: stub, notifier: notifier}
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("PATCH", "/group/7", nil)
	c.Set("telephon", "+1")
	c.Set("groupID", uint(7))
	c.Set("groupInfo", models.GroupInfoUpdate{Name: &name})
	h.HandleUpdateGroupInfo()(c)

	assert.Equal(t, http.StatusOK, w.Code)
	payload, ok := findEvent(notifier, "group_info", "+2")
	require.True(t, ok)
	assert.Equal(t, "Nuevo", payload["name"])
	assert.NotNil(t, payload["systemMessage"])
}

// ─────────────────────────────────────────────────────────────────────────────
// Compatibilidad: group_member_added / group_member_left con systemMessage
// ─────────────────────────────────────────────────────────────────────────────

func TestHandleAddMembers_EventIncludesSystemMessage(t *testing.T) {
	sys := &schemas.GroupMessageResponse{MessageID: 8, Kind: models.GroupMessageKindSystem, SystemEvent: models.SystemEventMemberAdded}
	stub := &stubMemberService{
		addResult: []schemas.GroupMemberBrief{{Telephon: "+2", Username: "luis"}},
		addSystem: sys,
		detail: &schemas.GroupDetail{
			GroupResponse: schemas.GroupResponse{ID: 7},
			Members: []schemas.GroupMemberResponse{
				{Telephon: "+1", Username: "ana"},
				{Telephon: "+2", Username: "luis"},
			},
		},
	}
	notifier := &fakeNotifier{}
	h := &HandlerGroup{service: stub, notifier: notifier}
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/group/7/members", nil)
	c.Set("telephon", "+1")
	c.Set("groupID", uint(7))
	c.Set("groupAddMembers", models.GroupAddMembers{Members: []string{"+2"}})
	h.HandleAddMembers()(c)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.NotEmpty(t, notifier.sent, "se emite el evento")
}

func TestHandleLeaveGroup_EventIncludesSystemMessage(t *testing.T) {
	sys := &schemas.GroupMessageResponse{MessageID: 9, Kind: models.GroupMessageKindSystem, SystemEvent: models.SystemEventMemberLeft}
	stub := &stubMemberService{leaveSystem: sys, username: "ana", memberTel: []string{"+2", "+3"}}
	notifier := &fakeNotifier{}
	h := &HandlerGroup{service: stub, notifier: notifier}
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("DELETE", "/group/7/member", nil)
	c.Set("telephon", "+1")
	c.Set("groupID", uint(7))
	h.HandleLeaveGroup()(c)

	assert.Equal(t, http.StatusOK, w.Code)
	payload, ok := findEvent(notifier, "group_member_left", "+2")
	require.True(t, ok)
	assert.NotNil(t, payload["systemMessage"])
	assert.Equal(t, "+1", payload["telephon"])
}
