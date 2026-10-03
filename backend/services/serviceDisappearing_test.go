package services

import (
	"context"
	"errors"
	"testing"

	"gorm/backend/models"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// ── Grupo ────────────────────────────────────────────────────────────────────

func newDisappearGroupService() (*ServiceGroup, *MockGroupRepo, *MockGroupContactRepo) {
	svc, repo, contacts := newMemberService()
	return svc.(*ServiceGroup), repo, contacts
}

func disappearSysMatcher(seconds string) interface{} {
	return mock.MatchedBy(func(m *models.GroupMessage) bool {
		return m != nil &&
			m.Kind == models.GroupMessageKindSystem &&
			m.SystemEvent == models.SystemEventDisappearingChanged &&
			m.SenderID == memActorID &&
			m.GroupID == memGroupID &&
			m.Message == seconds
	})
}

func TestSetGroupDisappearing_InvalidValueRejectedBeforeRepo(t *testing.T) {
	svc, repo, contacts := newDisappearGroupService()

	changed, res, err := svc.SetGroupDisappearing(memActorTel, memGroupID, 3600, context.Background())

	assert.ErrorIs(t, err, models.ErrInvalidDisappearDuration)
	assert.False(t, changed)
	assert.Nil(t, res)
	repo.AssertNotCalled(t, "SetGroupDisappearing", mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything)
	repo.AssertNotCalled(t, "GetMemberRole", mock.Anything, mock.Anything, mock.Anything)
	contacts.AssertNotCalled(t, "GetIdByTelephon", mock.Anything, mock.Anything)
}

func TestSetGroupDisappearing_MemberAllowedWhenOpen(t *testing.T) {
	svc, repo, contacts := newDisappearGroupService()
	expectMemActor(repo, contacts, models.GroupRoleMember)
	contacts.On("GetUsernameByTelephon", memActorTel, mock.Anything).Return("ana", nil)
	repo.On("GetGroupByID", memGroupID, mock.Anything).Return(&models.Group{OnlyAdminsCanEditInfo: false}, nil)
	repo.On("SetGroupDisappearing", uint(memActorID), memGroupID, 86400, disappearSysMatcher("86400"), mock.Anything).
		Return(true, nil, nil).Run(func(args mock.Arguments) {
		args.Get(3).(*models.GroupMessage).ID = 55
	})

	changed, res, err := svc.SetGroupDisappearing(memActorTel, memGroupID, 86400, context.Background())

	require.NoError(t, err)
	assert.True(t, changed)
	require.NotNil(t, res)
	assert.Equal(t, uint(55), res.MessageID)
	assert.Equal(t, models.SystemEventDisappearingChanged, res.SystemEvent)
	assert.Equal(t, "86400", res.Message)
}

func TestSetGroupDisappearing_MemberRestricted(t *testing.T) {
	svc, repo, contacts := newDisappearGroupService()
	expectMemActor(repo, contacts, models.GroupRoleMember)
	repo.On("GetGroupByID", memGroupID, mock.Anything).Return(&models.Group{OnlyAdminsCanEditInfo: true}, nil)

	changed, res, err := svc.SetGroupDisappearing(memActorTel, memGroupID, 86400, context.Background())

	assert.ErrorIs(t, err, ErrGroupEditRestricted)
	assert.False(t, changed)
	assert.Nil(t, res)
	repo.AssertNotCalled(t, "SetGroupDisappearing", mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything)
}

func TestSetGroupDisappearing_AdminAllowedWhenRestricted(t *testing.T) {
	svc, repo, contacts := newDisappearGroupService()
	expectMemActor(repo, contacts, models.GroupRoleAdmin)
	contacts.On("GetUsernameByTelephon", memActorTel, mock.Anything).Return("ana", nil)
	repo.On("GetGroupByID", memGroupID, mock.Anything).Return(&models.Group{OnlyAdminsCanEditInfo: true}, nil)
	repo.On("SetGroupDisappearing", uint(memActorID), memGroupID, 604800, disappearSysMatcher("604800"), mock.Anything).
		Return(true, nil, nil).Run(func(args mock.Arguments) {
		args.Get(3).(*models.GroupMessage).ID = 9
	})

	changed, res, err := svc.SetGroupDisappearing(memActorTel, memGroupID, 604800, context.Background())

	require.NoError(t, err)
	assert.True(t, changed)
	require.NotNil(t, res)
}

func TestSetGroupDisappearing_UnchangedReturnsNoSystemMessage(t *testing.T) {
	svc, repo, contacts := newDisappearGroupService()
	expectMemActor(repo, contacts, models.GroupRoleAdmin)
	repo.On("GetGroupByID", memGroupID, mock.Anything).Return(&models.Group{}, nil)
	repo.On("SetGroupDisappearing", uint(memActorID), memGroupID, 0, mock.Anything, mock.Anything).
		Return(false, nil, nil)

	changed, res, err := svc.SetGroupDisappearing(memActorTel, memGroupID, 0, context.Background())

	require.NoError(t, err)
	assert.False(t, changed)
	assert.Nil(t, res)
}

func TestSetGroupDisappearing_RepoErrorPropagates(t *testing.T) {
	svc, repo, contacts := newDisappearGroupService()
	expectMemActor(repo, contacts, models.GroupRoleAdmin)
	repo.On("GetGroupByID", memGroupID, mock.Anything).Return(&models.Group{}, nil)
	boom := errors.New("db down")
	repo.On("SetGroupDisappearing", mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything).
		Return(false, nil, boom)

	_, _, err := svc.SetGroupDisappearing(memActorTel, memGroupID, 86400, context.Background())

	assert.ErrorIs(t, err, boom)
}

func TestGetGroupDisappearing_MemberOnly(t *testing.T) {
	svc, repo, contacts := newDisappearGroupService()
	expectMemActor(repo, contacts, models.GroupRoleMember)
	repo.On("GetGroupDisappearing", memGroupID, mock.Anything).Return(604800, nil)

	got, err := svc.GetGroupDisappearing(memActorTel, memGroupID, context.Background())

	require.NoError(t, err)
	assert.Equal(t, 604800, got)
}

// ── Chat 1:1 ─────────────────────────────────────────────────────────────────

type stubDisappearChatRepo struct {
	ChatRepoInterface
	ids          map[string]int
	current      int
	changed      bool
	setCalled    bool
	gotActor     uint
	gotOther     uint
	gotSeconds   int
	gotMsg       *models.Message
	setErr       error
	getCalledFor [2]uint
}

func (r *stubDisappearChatRepo) GetIdByTelephon(telephon string, ctx context.Context) (int, error) {
	id, ok := r.ids[telephon]
	if !ok {
		return 0, errors.New("not found")
	}
	return id, nil
}

func (r *stubDisappearChatRepo) SetChatDisappearing(actorID, otherID uint, seconds int, sysMsg *models.Message, ctx context.Context) (bool, *models.Message, error) {
	r.setCalled = true
	r.gotActor, r.gotOther, r.gotSeconds, r.gotMsg = actorID, otherID, seconds, sysMsg
	if r.setErr != nil {
		return false, nil, r.setErr
	}
	if !r.changed {
		return false, nil, nil
	}
	sysMsg.Model = gorm.Model{ID: 77}
	return true, sysMsg, nil
}

func (r *stubDisappearChatRepo) GetChatDisappearing(userA, userB uint, ctx context.Context) (int, error) {
	r.getCalledFor = [2]uint{userA, userB}
	return r.current, nil
}

func newDisappearChat(changed bool) (*ServiceChat, *stubDisappearChatRepo) {
	repo := &stubDisappearChatRepo{ids: map[string]int{"+ana": 9, "+luis": 4}, changed: changed}
	return &ServiceChat{repo: repo}, repo
}

func TestSetChatDisappearing_InvalidValueRejectedBeforeRepo(t *testing.T) {
	svc, repo := newDisappearChat(true)

	changed, msg, err := svc.SetChatDisappearing("+ana", "+luis", 42, context.Background())

	assert.ErrorIs(t, err, models.ErrInvalidDisappearDuration)
	assert.False(t, changed)
	assert.Nil(t, msg)
	assert.False(t, repo.setCalled)
}

func TestSetChatDisappearing_BuildsSystemMessageForRepo(t *testing.T) {
	svc, repo := newDisappearChat(true)

	changed, msg, err := svc.SetChatDisappearing("+ana", "+luis", 86400, context.Background())

	require.NoError(t, err)
	assert.True(t, changed)
	require.NotNil(t, msg)
	assert.Equal(t, uint(77), msg.ID)
	assert.Equal(t, uint(9), repo.gotActor)
	assert.Equal(t, uint(4), repo.gotOther)
	assert.Equal(t, 86400, repo.gotSeconds)
	require.NotNil(t, repo.gotMsg)
	assert.Equal(t, models.MessageKindSystem, repo.gotMsg.Kind)
	assert.Equal(t, models.SystemEventDisappearingChanged, repo.gotMsg.SystemEvent)
	assert.Equal(t, "86400", repo.gotMsg.Message)
	assert.Equal(t, uint(9), repo.gotMsg.IdUser)
	assert.Equal(t, uint(4), repo.gotMsg.IdReceptor)
}

func TestSetChatDisappearing_UnchangedReturnsNoMessage(t *testing.T) {
	svc, _ := newDisappearChat(false)

	changed, msg, err := svc.SetChatDisappearing("+ana", "+luis", 0, context.Background())

	require.NoError(t, err)
	assert.False(t, changed)
	assert.Nil(t, msg)
}

func TestSetChatDisappearing_UnknownContact(t *testing.T) {
	svc, repo := newDisappearChat(true)

	_, _, err := svc.SetChatDisappearing("+ana", "+nadie", 86400, context.Background())

	assert.Error(t, err)
	assert.False(t, repo.setCalled)
}

func TestSetChatDisappearing_RepoErrorPropagates(t *testing.T) {
	svc, repo := newDisappearChat(true)
	repo.setErr = errors.New("db down")

	_, _, err := svc.SetChatDisappearing("+ana", "+luis", 86400, context.Background())

	assert.ErrorIs(t, err, repo.setErr)
}

func TestGetChatDisappearing(t *testing.T) {
	svc, repo := newDisappearChat(false)
	repo.current = 604800

	got, err := svc.GetChatDisappearing("+ana", "+luis", context.Background())

	require.NoError(t, err)
	assert.Equal(t, 604800, got)
	assert.Equal(t, [2]uint{9, 4}, repo.getCalledFor)
}
