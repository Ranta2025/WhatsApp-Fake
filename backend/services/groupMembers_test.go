package services

import (
	"context"
	"errors"
	"reflect"
	"testing"

	"gorm/backend/models"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// ─────────────────────────────────────────────────────────────────────────────
// Member management: promote / dismiss / remove / settings / info
// ─────────────────────────────────────────────────────────────────────────────

const (
	memGroupID   uint = 21
	memActorID        = 1
	memActorTel       = "+34600000201"
	memTargetID       = 2
	memTargetTel      = "+34600000202"
)

func newMemberService() (GroupServicer, *MockGroupRepo, *MockGroupContactRepo) {
	repo := &MockGroupRepo{}
	contacts := &MockGroupContactRepo{}
	return InitServiceGroup(repo, contacts), repo, contacts
}

// expectMemActor prepara la resolución del actor y su rol.
func expectMemActor(repo *MockGroupRepo, contacts *MockGroupContactRepo, role string) {
	contacts.On("GetIdByTelephon", memActorTel, mock.Anything).Return(memActorID, nil)
	repo.On("GetMemberRole", memGroupID, uint(memActorID), mock.Anything).Return(role, nil)
}

// expectMemTarget prepara la resolución del objetivo y su rol.
func expectMemTarget(repo *MockGroupRepo, contacts *MockGroupContactRepo, role string) {
	contacts.On("GetIdByTelephon", memTargetTel, mock.Anything).Return(memTargetID, nil)
	repo.On("GetMemberRole", memGroupID, uint(memTargetID), mock.Anything).Return(role, nil)
}

// sysMatcher comprueba que el mensaje de sistema pasado al repo tenga la forma
// esperada (evento, actor y targets).
func sysMatcher(event string, actorID uint, targets []string) interface{} {
	return mock.MatchedBy(func(m *models.GroupMessage) bool {
		return m != nil &&
			m.Kind == models.GroupMessageKindSystem &&
			m.SystemEvent == event &&
			m.SenderID == actorID &&
			reflect.DeepEqual(m.SystemTargets, targets)
	})
}

// ── Promote ──────────────────────────────────────────────────────────────────

func TestPromote_Valid(t *testing.T) {
	svc, repo, contacts := newMemberService()
	expectMemActor(repo, contacts, models.GroupRoleAdmin)
	expectMemTarget(repo, contacts, models.GroupRoleMember)
	repo.On("ChangeMemberRole", memGroupID, uint(memActorID), uint(memTargetID), models.GroupRoleAdmin, sysMatcher(models.SystemEventAdminGranted, memActorID, []string{memTargetTel}), mock.Anything).Return(nil)

	msg, err := svc.Promote(memActorTel, memGroupID, memTargetTel, context.Background())

	require.NoError(t, err)
	assert.Nil(t, msg, "el mock no persiste, así que no hay mensaje con id")
	repo.AssertExpectations(t)
}

func TestPromote_NonAdminActorRejected(t *testing.T) {
	svc, repo, contacts := newMemberService()
	expectMemActor(repo, contacts, models.GroupRoleMember)

	msg, err := svc.Promote(memActorTel, memGroupID, memTargetTel, context.Background())

	assert.Nil(t, msg)
	assert.ErrorIs(t, err, ErrNotGroupAdmin)
	repo.AssertNotCalled(t, "ChangeMemberRole", mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything)
}

func TestPromote_TargetNotMemberRejected(t *testing.T) {
	svc, repo, contacts := newMemberService()
	expectMemActor(repo, contacts, models.GroupRoleAdmin)
	contacts.On("GetIdByTelephon", memTargetTel, mock.Anything).Return(memTargetID, nil)
	repo.On("GetMemberRole", memGroupID, uint(memTargetID), mock.Anything).Return("", errors.New("no miembro"))

	msg, err := svc.Promote(memActorTel, memGroupID, memTargetTel, context.Background())

	assert.Nil(t, msg)
	assert.ErrorIs(t, err, ErrGroupTargetNotMember)
	repo.AssertNotCalled(t, "ChangeMemberRole", mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything)
}

func TestPromote_TargetAlreadyAdminRejected(t *testing.T) {
	svc, repo, contacts := newMemberService()
	expectMemActor(repo, contacts, models.GroupRoleAdmin)
	expectMemTarget(repo, contacts, models.GroupRoleAdmin)

	msg, err := svc.Promote(memActorTel, memGroupID, memTargetTel, context.Background())

	assert.Nil(t, msg)
	assert.ErrorIs(t, err, ErrInvalidRoleChange)
	repo.AssertNotCalled(t, "ChangeMemberRole", mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything)
}

func TestPromote_SelfRejected(t *testing.T) {
	svc, repo, contacts := newMemberService()
	contacts.On("GetIdByTelephon", memActorTel, mock.Anything).Return(memActorID, nil)
	repo.On("GetMemberRole", memGroupID, uint(memActorID), mock.Anything).Return(models.GroupRoleAdmin, nil)

	msg, err := svc.Promote(memActorTel, memGroupID, memActorTel, context.Background())

	assert.Nil(t, msg)
	assert.ErrorIs(t, err, ErrInvalidRoleChange)
	repo.AssertNotCalled(t, "ChangeMemberRole", mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything)
}

func TestPromote_ActorNotMemberRejected(t *testing.T) {
	svc, repo, contacts := newMemberService()
	contacts.On("GetIdByTelephon", memActorTel, mock.Anything).Return(memActorID, nil)
	repo.On("GetMemberRole", memGroupID, uint(memActorID), mock.Anything).Return("", errors.New("no miembro"))

	msg, err := svc.Promote(memActorTel, memGroupID, memTargetTel, context.Background())

	assert.Nil(t, msg)
	assert.ErrorIs(t, err, ErrNotGroupMember)
}

// ── Dismiss ──────────────────────────────────────────────────────────────────

func TestDismiss_Valid(t *testing.T) {
	svc, repo, contacts := newMemberService()
	expectMemActor(repo, contacts, models.GroupRoleAdmin)
	expectMemTarget(repo, contacts, models.GroupRoleAdmin)
	repo.On("ChangeMemberRole", memGroupID, uint(memActorID), uint(memTargetID), models.GroupRoleMember, sysMatcher(models.SystemEventAdminRevoked, memActorID, []string{memTargetTel}), mock.Anything).Return(nil)

	_, err := svc.Dismiss(memActorTel, memGroupID, memTargetTel, context.Background())

	require.NoError(t, err)
	repo.AssertExpectations(t)
}

func TestDismiss_NonAdminActorRejected(t *testing.T) {
	svc, repo, contacts := newMemberService()
	expectMemActor(repo, contacts, models.GroupRoleMember)

	_, err := svc.Dismiss(memActorTel, memGroupID, memTargetTel, context.Background())

	assert.ErrorIs(t, err, ErrNotGroupAdmin)
}

func TestDismiss_SelfRejected(t *testing.T) {
	svc, repo, contacts := newMemberService()
	contacts.On("GetIdByTelephon", memActorTel, mock.Anything).Return(memActorID, nil)
	repo.On("GetMemberRole", memGroupID, uint(memActorID), mock.Anything).Return(models.GroupRoleAdmin, nil)

	_, err := svc.Dismiss(memActorTel, memGroupID, memActorTel, context.Background())

	assert.ErrorIs(t, err, ErrInvalidRoleChange)
	repo.AssertNotCalled(t, "ChangeMemberRole", mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything)
}

func TestDismiss_TargetNotAdminRejected(t *testing.T) {
	svc, repo, contacts := newMemberService()
	expectMemActor(repo, contacts, models.GroupRoleAdmin)
	expectMemTarget(repo, contacts, models.GroupRoleMember)

	_, err := svc.Dismiss(memActorTel, memGroupID, memTargetTel, context.Background())

	assert.ErrorIs(t, err, ErrInvalidRoleChange)
	repo.AssertNotCalled(t, "ChangeMemberRole", mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything)
}

func TestDismiss_TargetNotMemberRejected(t *testing.T) {
	svc, repo, contacts := newMemberService()
	expectMemActor(repo, contacts, models.GroupRoleAdmin)
	contacts.On("GetIdByTelephon", memTargetTel, mock.Anything).Return(memTargetID, nil)
	repo.On("GetMemberRole", memGroupID, uint(memTargetID), mock.Anything).Return("", errors.New("no miembro"))

	_, err := svc.Dismiss(memActorTel, memGroupID, memTargetTel, context.Background())

	assert.ErrorIs(t, err, ErrGroupTargetNotMember)
}

// ── Remove ───────────────────────────────────────────────────────────────────

func TestRemove_Valid(t *testing.T) {
	svc, repo, contacts := newMemberService()
	expectMemActor(repo, contacts, models.GroupRoleAdmin)
	expectMemTarget(repo, contacts, models.GroupRoleMember)
	repo.On("RemoveMember", memGroupID, uint(memActorID), uint(memTargetID), sysMatcher(models.SystemEventMemberRemoved, memActorID, []string{memTargetTel}), mock.Anything).Return(nil)

	_, err := svc.Remove(memActorTel, memGroupID, memTargetTel, context.Background())

	require.NoError(t, err)
	repo.AssertExpectations(t)
}

func TestRemove_NonAdminActorRejected(t *testing.T) {
	svc, repo, contacts := newMemberService()
	expectMemActor(repo, contacts, models.GroupRoleMember)

	_, err := svc.Remove(memActorTel, memGroupID, memTargetTel, context.Background())

	assert.ErrorIs(t, err, ErrNotGroupAdmin)
	repo.AssertNotCalled(t, "RemoveMember", mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything)
}

func TestRemove_SelfRejected(t *testing.T) {
	svc, repo, contacts := newMemberService()
	contacts.On("GetIdByTelephon", memActorTel, mock.Anything).Return(memActorID, nil)
	repo.On("GetMemberRole", memGroupID, uint(memActorID), mock.Anything).Return(models.GroupRoleAdmin, nil)

	_, err := svc.Remove(memActorTel, memGroupID, memActorTel, context.Background())

	assert.ErrorIs(t, err, ErrInvalidRoleChange)
	repo.AssertNotCalled(t, "RemoveMember", mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything)
}

func TestRemove_TargetNotMemberRejected(t *testing.T) {
	svc, repo, contacts := newMemberService()
	expectMemActor(repo, contacts, models.GroupRoleAdmin)
	contacts.On("GetIdByTelephon", memTargetTel, mock.Anything).Return(memTargetID, nil)
	repo.On("GetMemberRole", memGroupID, uint(memTargetID), mock.Anything).Return("", errors.New("no miembro"))

	_, err := svc.Remove(memActorTel, memGroupID, memTargetTel, context.Background())

	assert.ErrorIs(t, err, ErrGroupTargetNotMember)
}

// ── Promote/Dismiss/Remove: mensaje devuelto cuando el repo lo persiste ──────

func TestPromote_ReturnsPersistedSystemMessage(t *testing.T) {
	svc, repo, contacts := newMemberService()
	expectMemActor(repo, contacts, models.GroupRoleAdmin)
	expectMemTarget(repo, contacts, models.GroupRoleMember)
	contacts.On("GetUsernameByTelephon", memActorTel, mock.Anything).Return("ana", nil)
	// El repo real muta el puntero `system` in-place (GORM asigna el id); el
	// mock lo emula para comprobar el mapeo a schema.
	repo.On("ChangeMemberRole", memGroupID, uint(memActorID), uint(memTargetID), models.GroupRoleAdmin, mock.Anything, mock.Anything).
		Run(func(args mock.Arguments) {
			args.Get(4).(*models.GroupMessage).Model = gorm.Model{ID: 77}
		}).Return(nil)

	msg, err := svc.Promote(memActorTel, memGroupID, memTargetTel, context.Background())

	require.NoError(t, err)
	require.NotNil(t, msg)
	assert.Equal(t, uint(77), msg.MessageID)
	assert.Equal(t, models.GroupMessageKindSystem, msg.Kind)
	assert.Equal(t, models.SystemEventAdminGranted, msg.SystemEvent)
	assert.Equal(t, "ana", msg.SenderUsername)
}

// ── UpdateSettings ───────────────────────────────────────────────────────────

func TestUpdateSettings_Valid(t *testing.T) {
	svc, repo, contacts := newMemberService()
	expectMemActor(repo, contacts, models.GroupRoleAdmin)
	only := true
	repo.On("UpdateGroupSettings", memGroupID, uint(memActorID), mock.Anything, sysMatcher(models.SystemEventSettingsChanged, memActorID, nil), mock.Anything).
		Return(&models.Group{OnlyAdminsCanSend: true}, nil)

	res, err := svc.UpdateSettings(memActorTel, memGroupID, models.GroupSettingsUpdate{OnlyAdminsCanSend: &only}, context.Background())

	require.NoError(t, err)
	require.NotNil(t, res)
	assert.True(t, res.OnlyAdminsCanSend)
	assert.Equal(t, memGroupID, res.GroupID)
}

func TestUpdateSettings_NoFieldsRejected(t *testing.T) {
	svc, repo, _ := newMemberService()

	res, err := svc.UpdateSettings(memActorTel, memGroupID, models.GroupSettingsUpdate{}, context.Background())

	assert.Nil(t, res)
	assert.EqualError(t, err, "debes indicar al menos una configuración")
	repo.AssertNotCalled(t, "GetMemberRole", mock.Anything, mock.Anything, mock.Anything)
}

func TestUpdateSettings_NonAdminRejected(t *testing.T) {
	svc, repo, contacts := newMemberService()
	expectMemActor(repo, contacts, models.GroupRoleMember)
	only := true

	res, err := svc.UpdateSettings(memActorTel, memGroupID, models.GroupSettingsUpdate{OnlyAdminsCanSend: &only}, context.Background())

	assert.Nil(t, res)
	assert.ErrorIs(t, err, ErrNotGroupAdmin)
}

// ── UpdateInfo ───────────────────────────────────────────────────────────────

func TestUpdateInfo_AdminValid(t *testing.T) {
	svc, repo, contacts := newMemberService()
	expectMemActor(repo, contacts, models.GroupRoleAdmin)
	repo.On("GetGroupByID", memGroupID, mock.Anything).Return(&models.Group{}, nil)
	name := "  Nuevo nombre  "
	repo.On("UpdateGroupInfo", memGroupID, uint(memActorID), mock.Anything, (*string)(nil), sysMatcher(models.SystemEventInfoChanged, memActorID, nil), mock.Anything).
		Return(&models.Group{Name: "Nuevo nombre"}, nil)

	res, err := svc.UpdateInfo(memActorTel, memGroupID, models.GroupInfoUpdate{Name: &name}, context.Background())

	require.NoError(t, err)
	require.NotNil(t, res)
	assert.Equal(t, "Nuevo nombre", res.Name)
}

func TestUpdateInfo_MemberAllowedWhenOpen(t *testing.T) {
	svc, repo, contacts := newMemberService()
	expectMemActor(repo, contacts, models.GroupRoleMember)
	repo.On("GetGroupByID", memGroupID, mock.Anything).Return(&models.Group{OnlyAdminsCanEditInfo: false}, nil)
	desc := "nueva"
	repo.On("UpdateGroupInfo", memGroupID, uint(memActorID), (*string)(nil), mock.Anything, sysMatcher(models.SystemEventInfoChanged, memActorID, nil), mock.Anything).
		Return(&models.Group{Description: "nueva"}, nil)

	res, err := svc.UpdateInfo(memActorTel, memGroupID, models.GroupInfoUpdate{Description: &desc}, context.Background())

	require.NoError(t, err)
	require.NotNil(t, res)
	assert.Equal(t, "nueva", res.Description)
}

func TestUpdateInfo_MemberRestricted(t *testing.T) {
	svc, repo, contacts := newMemberService()
	expectMemActor(repo, contacts, models.GroupRoleMember)
	repo.On("GetGroupByID", memGroupID, mock.Anything).Return(&models.Group{OnlyAdminsCanEditInfo: true}, nil)
	name := "x"

	res, err := svc.UpdateInfo(memActorTel, memGroupID, models.GroupInfoUpdate{Name: &name}, context.Background())

	assert.Nil(t, res)
	assert.ErrorIs(t, err, ErrGroupEditRestricted)
}

func TestUpdateInfo_NoFieldsRejected(t *testing.T) {
	svc, repo, _ := newMemberService()

	res, err := svc.UpdateInfo(memActorTel, memGroupID, models.GroupInfoUpdate{}, context.Background())

	assert.Nil(t, res)
	assert.EqualError(t, err, "debes indicar el nombre o la descripción")
	repo.AssertNotCalled(t, "GetMemberRole", mock.Anything, mock.Anything, mock.Anything)
}

func TestUpdateInfo_Validation(t *testing.T) {
	long := ""
	for i := 0; i < 101; i++ {
		long += "a"
	}
	blank := "   "
	descLong := long + long + long + "a" // 301

	cases := []struct {
		name    string
		data    models.GroupInfoUpdate
		wantErr string
	}{
		{"nombre vacío", models.GroupInfoUpdate{Name: &blank}, "el nombre del grupo no puede estar vacío"},
		{"nombre demasiado largo", models.GroupInfoUpdate{Name: &long}, "el nombre del grupo no puede superar los 100 caracteres"},
		{"descripción demasiado larga", models.GroupInfoUpdate{Description: &descLong}, "la descripción no puede superar los 300 caracteres"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			svc, repo, _ := newMemberService()
			res, err := svc.UpdateInfo(memActorTel, memGroupID, tc.data, context.Background())
			assert.Nil(t, res)
			assert.EqualError(t, err, tc.wantErr)
			repo.AssertNotCalled(t, "GetMemberRole", mock.Anything, mock.Anything, mock.Anything)
		})
	}
}

// ── AddMembers / LeaveGroup: los eventos incluyen el systemMessage ───────────

func TestAddMembers_ReturnsSystemMessage(t *testing.T) {
	svc, repo, contacts := newGroupServiceForSend()
	contacts.On("GetIdByTelephon", testSenderTel, mock.Anything).Return(testSenderID, nil)
	contacts.On("GetIdByTelephon", "+34600000011", mock.Anything).Return(11, nil)
	contacts.On("IsAcceptedContact", uint(testSenderID), uint(11), mock.Anything).Return(true, nil)
	contacts.On("GetUsernameByTelephon", testSenderTel, mock.Anything).Return("ana", nil)
	repo.On("GetMemberRole", testGroupID, uint(testSenderID), mock.Anything).Return(models.GroupRoleAdmin, nil)
	repo.On("GetGroupByID", testGroupID, mock.Anything).Return(&models.Group{}, nil)
	repo.On("AddMembers", testGroupID, mock.Anything, mock.Anything, mock.Anything).
		Run(func(args mock.Arguments) {
			args.Get(2).(*models.GroupMessage).Model = gorm.Model{ID: 90}
		}).
		Return([]models.GroupMember{userMember(11, "+34600000011", "marta")}, nil)

	added, systemMsg, err := svc.AddMembers(testSenderTel, testGroupID,
		models.GroupAddMembers{Members: []string{"+34600000011"}}, context.Background())

	require.NoError(t, err)
	require.Len(t, added, 1)
	require.NotNil(t, systemMsg)
	assert.Equal(t, uint(90), systemMsg.MessageID)
	assert.Equal(t, models.SystemEventMemberAdded, systemMsg.SystemEvent)
	assert.Equal(t, "ana", systemMsg.SenderUsername)
}

func TestLeaveGroup_ReturnsSystemMessage(t *testing.T) {
	svc, repo, contacts := newGroupServiceForSend()
	contacts.On("GetIdByTelephon", testSenderTel, mock.Anything).Return(testSenderID, nil)
	contacts.On("GetUsernameByTelephon", testSenderTel, mock.Anything).Return("ana", nil)
	repo.On("IsMember", testGroupID, uint(testSenderID), mock.Anything).Return(true, nil)
	repo.On("LeaveGroup", testGroupID, uint(testSenderID), mock.Anything, mock.Anything).
		Run(func(args mock.Arguments) {
			args.Get(2).(*models.GroupMessage).Model = gorm.Model{ID: 91}
		}).Return(nil)

	systemMsg, err := svc.LeaveGroup(testSenderTel, testGroupID, context.Background())

	require.NoError(t, err)
	require.NotNil(t, systemMsg)
	assert.Equal(t, uint(91), systemMsg.MessageID)
	assert.Equal(t, models.SystemEventMemberLeft, systemMsg.SystemEvent)
}

// El service construye el mensaje de sistema dentro de la transacción del repo;
// si el repo no lo persiste (error), no se devuelve mensaje.
func TestPromote_RepoErrorDoesNotReturnMessage(t *testing.T) {
	svc, repo, contacts := newMemberService()
	expectMemActor(repo, contacts, models.GroupRoleAdmin)
	expectMemTarget(repo, contacts, models.GroupRoleMember)
	repo.On("ChangeMemberRole", memGroupID, uint(memActorID), uint(memTargetID), models.GroupRoleAdmin, mock.Anything, mock.Anything).
		Return(errors.New("db"))

	msg, err := svc.Promote(memActorTel, memGroupID, memTargetTel, context.Background())

	assert.Nil(t, msg)
	assert.EqualError(t, err, "db")
}
