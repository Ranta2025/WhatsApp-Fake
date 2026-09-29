package services

import (
	"context"
	"errors"
	"gorm/backend/models"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// ── 1:1 ─────────────────────────────────────────────────────────────────────

type stubWindowChatRepo struct {
	ChatRepoInterface
	msgs                []models.Message
	hasOlder, hasNewer  bool
	err                 error
	gotUser, gotOther   uint
	gotAround, gotAfter uint
	gotLimit            int
}

func (r *stubWindowChatRepo) GetIdByTelephon(telephon string, ctx context.Context) (int, error) {
	if telephon == "user" {
		return 1, nil
	}
	return 2, nil
}

func (r *stubWindowChatRepo) GetMessagesAround(userID, contactID, around uint, limit int, ctx context.Context) ([]models.Message, bool, bool, error) {
	r.gotUser, r.gotOther, r.gotAround, r.gotLimit = userID, contactID, around, limit
	return r.msgs, r.hasOlder, r.hasNewer, r.err
}

func (r *stubWindowChatRepo) GetMessagesAfter(userID, contactID, after uint, limit int, ctx context.Context) ([]models.Message, bool, error) {
	r.gotUser, r.gotOther, r.gotAfter, r.gotLimit = userID, contactID, after, limit
	return r.msgs, r.hasNewer, r.err
}

func TestServiceGetMessagesAround_MapsAndPassesFlags(t *testing.T) {
	repo := &stubWindowChatRepo{
		msgs:     []models.Message{{Model: gorm.Model{ID: 5}, IdUser: 1, IdReceptor: 2, Message: "a"}, {Model: gorm.Model{ID: 6}, IdUser: 2, IdReceptor: 1, Message: "b"}},
		hasOlder: true, hasNewer: false,
	}
	msgs, older, newer, err := InitServiceMessage(repo).ServiceGetMessagesAround("user", "contact", 5, 20, context.Background())

	require.NoError(t, err)
	assert.True(t, older)
	assert.False(t, newer)
	assert.Equal(t, uint(5), repo.gotAround)
	assert.Equal(t, 20, repo.gotLimit)
	require.Len(t, msgs, 2)
	assert.Equal(t, "user", msgs[0].SenderTelephon)
	assert.Equal(t, "contact", msgs[1].SenderTelephon)
}

func TestServiceGetMessagesAround_LimitRules(t *testing.T) {
	cases := []struct{ in, want int }{{0, windowDefaultLimit}, {-1, windowDefaultLimit}, {20, 20}, {5000, windowMaxLimit}}
	for _, tc := range cases {
		repo := &stubWindowChatRepo{}
		_, _, _, err := InitServiceMessage(repo).ServiceGetMessagesAround("user", "contact", 5, tc.in, context.Background())
		require.NoError(t, err)
		assert.Equal(t, tc.want, repo.gotLimit, "limit=%d", tc.in)
	}
}

func TestServiceGetMessagesAround_NotFoundPropagates(t *testing.T) {
	repo := &stubWindowChatRepo{err: models.ErrMessageNotFound}
	_, _, _, err := InitServiceMessage(repo).ServiceGetMessagesAround("user", "contact", 5, 20, context.Background())
	assert.ErrorIs(t, err, models.ErrMessageNotFound)
}

func TestServiceGetMessagesAfter_MapsAndPassesFlags(t *testing.T) {
	repo := &stubWindowChatRepo{msgs: []models.Message{{Model: gorm.Model{ID: 9}, IdUser: 2, IdReceptor: 1}}, hasNewer: true}
	msgs, newer, err := InitServiceMessage(repo).ServiceGetMessagesAfter("user", "contact", 8, 0, context.Background())

	require.NoError(t, err)
	assert.True(t, newer)
	assert.Equal(t, uint(8), repo.gotAfter)
	assert.Equal(t, windowDefaultLimit, repo.gotLimit)
	require.Len(t, msgs, 1)
	assert.Equal(t, uint(9), msgs[0].MessageID)
}

func TestServiceGetMessagesAfter_RepoErrorPropagates(t *testing.T) {
	boom := errors.New("db")
	_, _, err := InitServiceMessage(&stubWindowChatRepo{err: boom}).ServiceGetMessagesAfter("user", "contact", 1, 10, context.Background())
	assert.ErrorIs(t, err, boom)
}

// ── Grupos ──────────────────────────────────────────────────────────────────

type stubWindowGroupRepo struct {
	GroupRepoInterface
	member             bool
	msgs               []models.GroupMessage
	hasOlder, hasNewer bool
	err                error
	called             bool
	gotAround          uint
	gotAfter           uint
	gotLimit           int
}

func (r *stubWindowGroupRepo) IsMember(groupID, userID uint, ctx context.Context) (bool, error) {
	return r.member, nil
}

func (r *stubWindowGroupRepo) GetGroupMessagesAround(groupID, around uint, limit int, ctx context.Context) ([]models.GroupMessage, bool, bool, error) {
	r.called = true
	r.gotAround, r.gotLimit = around, limit
	return r.msgs, r.hasOlder, r.hasNewer, r.err
}

func (r *stubWindowGroupRepo) GetGroupMessagesAfter(groupID, after uint, limit int, ctx context.Context) ([]models.GroupMessage, bool, error) {
	r.called = true
	r.gotAfter, r.gotLimit = after, limit
	return r.msgs, r.hasNewer, r.err
}

func TestGetGroupMessagesAround_MemberOnly(t *testing.T) {
	repo := &stubWindowGroupRepo{member: true, msgs: []models.GroupMessage{{Model: gorm.Model{ID: 3}}}, hasOlder: true, hasNewer: true}
	svc := InitServiceGroup(repo, stubGroupContacts{})

	msgs, older, newer, err := svc.GetGroupMessagesAround("+1", 7, 3, 0, context.Background())
	require.NoError(t, err)
	assert.True(t, older)
	assert.True(t, newer)
	assert.Len(t, msgs, 1)
	assert.Equal(t, windowDefaultLimit, repo.gotLimit)

	denied := &stubWindowGroupRepo{member: false}
	_, _, _, err = InitServiceGroup(denied, stubGroupContacts{}).GetGroupMessagesAround("+1", 7, 3, 10, context.Background())
	assert.ErrorIs(t, err, ErrNotGroupMember)
	assert.False(t, denied.called)
}

func TestGetGroupMessagesAround_NotFoundPropagates(t *testing.T) {
	repo := &stubWindowGroupRepo{member: true, err: models.ErrGroupMessageNotFound}
	_, _, _, err := InitServiceGroup(repo, stubGroupContacts{}).GetGroupMessagesAround("+1", 7, 3, 10, context.Background())
	assert.ErrorIs(t, err, models.ErrGroupMessageNotFound)
}

func TestGetGroupMessagesAfter_MemberOnly(t *testing.T) {
	repo := &stubWindowGroupRepo{member: true, msgs: []models.GroupMessage{{Model: gorm.Model{ID: 4}}}, hasNewer: true}
	msgs, newer, err := InitServiceGroup(repo, stubGroupContacts{}).GetGroupMessagesAfter("+1", 7, 3, 25, context.Background())
	require.NoError(t, err)
	assert.True(t, newer)
	assert.Len(t, msgs, 1)
	assert.Equal(t, uint(3), repo.gotAfter)
	assert.Equal(t, 25, repo.gotLimit)

	denied := &stubWindowGroupRepo{member: false}
	_, _, err = InitServiceGroup(denied, stubGroupContacts{}).GetGroupMessagesAfter("+1", 7, 3, 25, context.Background())
	assert.ErrorIs(t, err, ErrNotGroupMember)
	assert.False(t, denied.called)
}
