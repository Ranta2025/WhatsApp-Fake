package services

import (
	"context"
	"errors"
	"gorm/backend/models"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestNormalizeSearchQuery(t *testing.T) {
	q, err := NormalizeSearchQuery("  canción  ")
	require.NoError(t, err)
	assert.Equal(t, "canción", q)

	for _, bad := range []string{"", " ", "a", "  a  ", strings.Repeat("x", 101)} {
		_, err := NormalizeSearchQuery(bad)
		assert.ErrorIs(t, err, ErrInvalidSearchQuery, "%q", bad)
	}
	_, err = NormalizeSearchQuery(strings.Repeat("ñ", 100))
	assert.NoError(t, err, "100 runes (no bytes) es válido")
	_, err = NormalizeSearchQuery("ab")
	assert.NoError(t, err)
}

// ── Chat 1:1 ────────────────────────────────────────────────────────────────

type stubSearchChatRepo struct {
	ChatRepoInterface
	rows      []models.SearchRow
	hasMore   bool
	called    bool
	gotUser   uint
	gotOther  uint
	gotQ      string
	gotBefore uint
	gotLimit  int
}

func (r *stubSearchChatRepo) GetIdByTelephon(telephon string, ctx context.Context) (int, error) {
	if telephon == "user" {
		return 1, nil
	}
	return 2, nil
}

func (r *stubSearchChatRepo) SearchMessages(userID, contactID uint, q string, before uint, limit int, ctx context.Context) ([]models.SearchRow, bool, error) {
	r.called = true
	r.gotUser, r.gotOther, r.gotQ, r.gotBefore, r.gotLimit = userID, contactID, q, before, limit
	return r.rows, r.hasMore, nil
}

func TestServiceSearchMessages_BuildsSnippetsAndPassesParams(t *testing.T) {
	when := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
	repo := &stubSearchChatRepo{
		rows:    []models.SearchRow{{ID: 9, Time: when, Message: "Mi CANCIÓN favorita"}},
		hasMore: true,
	}
	svc := InitServiceMessage(repo)

	page, err := svc.ServiceSearchMessages("user", "contact", "  cancion ", 40, 10, context.Background())

	require.NoError(t, err)
	assert.Equal(t, "cancion", repo.gotQ)
	assert.Equal(t, uint(40), repo.gotBefore)
	assert.Equal(t, 10, repo.gotLimit)
	assert.Equal(t, uint(1), repo.gotUser)
	assert.Equal(t, uint(2), repo.gotOther)
	assert.True(t, page.HasMore)
	require.Len(t, page.Results, 1)
	r := page.Results[0]
	assert.Equal(t, uint(9), r.MessageID)
	assert.Equal(t, when, r.Time)
	assert.Equal(t, "Mi CANCIÓN favorita", r.Snippet)
	assert.Equal(t, [][2]int{{3, 10}}, r.Highlights)
}

func TestServiceSearchMessages_LimitRules(t *testing.T) {
	cases := []struct{ in, want int }{{0, searchDefaultLimit}, {-3, searchDefaultLimit}, {10, 10}, {5000, searchMaxLimit}}
	for _, tc := range cases {
		repo := &stubSearchChatRepo{}
		_, err := InitServiceMessage(repo).ServiceSearchMessages("user", "contact", "hola", 0, tc.in, context.Background())
		require.NoError(t, err)
		assert.Equal(t, tc.want, repo.gotLimit, "limit=%d", tc.in)
	}
}

func TestServiceSearchMessages_EmptyResultsAreNotNil(t *testing.T) {
	page, err := InitServiceMessage(&stubSearchChatRepo{}).ServiceSearchMessages("user", "contact", "hola", 0, 0, context.Background())
	require.NoError(t, err)
	assert.NotNil(t, page.Results)
	assert.Empty(t, page.Results)
}

func TestServiceSearchMessages_InvalidQueryDoesNotHitRepo(t *testing.T) {
	repo := &stubSearchChatRepo{}
	_, err := InitServiceMessage(repo).ServiceSearchMessages("user", "contact", " a ", 0, 0, context.Background())
	assert.ErrorIs(t, err, ErrInvalidSearchQuery)
	assert.False(t, repo.called)
}

// ── Grupos ──────────────────────────────────────────────────────────────────

type stubSearchGroupRepo struct {
	GroupRepoInterface
	member    bool
	memberErr error
	rows      []models.SearchRow
	hasMore   bool
	called    bool
	gotGroup  uint
	gotUser   uint
	gotQ      string
	gotBefore uint
	gotLimit  int
}

func (r *stubSearchGroupRepo) IsMember(groupID, userID uint, ctx context.Context) (bool, error) {
	return r.member, r.memberErr
}

func (r *stubSearchGroupRepo) SearchGroupMessages(groupID, userID uint, q string, before uint, limit int, ctx context.Context) ([]models.SearchRow, bool, error) {
	r.called = true
	r.gotGroup, r.gotUser, r.gotQ, r.gotBefore, r.gotLimit = groupID, userID, q, before, limit
	return r.rows, r.hasMore, nil
}

type stubGroupContacts struct {
	GroupContactRepoInterface
}

func (stubGroupContacts) GetIdByTelephon(telephon string, ctx context.Context) (int, error) {
	if telephon == "ghost" {
		return 0, errors.New("no existe")
	}
	return 5, nil
}

func TestSearchGroupMessages_MemberGetsResults(t *testing.T) {
	repo := &stubSearchGroupRepo{member: true, rows: []models.SearchRow{{ID: 3, Message: "Reunión de equipo"}}, hasMore: true}
	svc := InitServiceGroup(repo, stubGroupContacts{})

	page, err := svc.SearchGroupMessages("+1", 7, " reunion ", 20, 0, context.Background())

	require.NoError(t, err)
	assert.True(t, page.HasMore)
	require.Len(t, page.Results, 1)
	assert.Equal(t, [][2]int{{0, 7}}, page.Results[0].Highlights)
	assert.Equal(t, uint(7), repo.gotGroup)
	assert.Equal(t, uint(5), repo.gotUser)
	assert.Equal(t, "reunion", repo.gotQ)
	assert.Equal(t, uint(20), repo.gotBefore)
	assert.Equal(t, searchDefaultLimit, repo.gotLimit)
}

func TestSearchGroupMessages_NonMemberForbiddenAndRepoUntouched(t *testing.T) {
	repo := &stubSearchGroupRepo{member: false}
	_, err := InitServiceGroup(repo, stubGroupContacts{}).SearchGroupMessages("+1", 7, "reunion", 0, 10, context.Background())
	assert.ErrorIs(t, err, ErrNotGroupMember)
	assert.False(t, repo.called)
}

func TestSearchGroupMessages_MembershipLookupFailureIsNotForbidden(t *testing.T) {
	boom := errors.New("db down")
	repo := &stubSearchGroupRepo{memberErr: boom}
	_, err := InitServiceGroup(repo, stubGroupContacts{}).SearchGroupMessages("+1", 7, "reunion", 0, 10, context.Background())
	assert.ErrorIs(t, err, boom)
	assert.NotErrorIs(t, err, ErrNotGroupMember)
}

func TestSearchGroupMessages_InvalidQueryChecksBeforeMembership(t *testing.T) {
	repo := &stubSearchGroupRepo{member: true}
	_, err := InitServiceGroup(repo, stubGroupContacts{}).SearchGroupMessages("+1", 7, "x", 0, 10, context.Background())
	assert.ErrorIs(t, err, ErrInvalidSearchQuery)
	assert.False(t, repo.called)
}

// ── Global ──────────────────────────────────────────────────────────────────

type stubGlobalChatRepo struct {
	rows       []models.GlobalSearchRow
	contacts   map[uint]string
	users      map[uint]models.UserBasic
	gotQ       string
	gotPerChat int
	gotMax     int
	called     bool
}

func (r *stubGlobalChatRepo) GetIdByTelephon(telephon string, ctx context.Context) (int, error) {
	return 1, nil
}
func (r *stubGlobalChatRepo) SearchMessagesGlobal(userID uint, q string, perChat, maxChats int, ctx context.Context) ([]models.GlobalSearchRow, error) {
	r.called = true
	r.gotQ, r.gotPerChat, r.gotMax = q, perChat, maxChats
	return r.rows, nil
}
func (r *stubGlobalChatRepo) GetAddedContactIDs(userID uint, ctx context.Context) (map[uint]string, error) {
	return r.contacts, nil
}
func (r *stubGlobalChatRepo) GetUsersBasicByIDs(ids []uint, ctx context.Context) (map[uint]models.UserBasic, error) {
	return r.users, nil
}

type stubGlobalGroupRepo struct {
	rows       []models.GlobalSearchRow
	groups     []models.UserGroupRow
	gotPerChat int
	gotMax     int
}

func (r *stubGlobalGroupRepo) SearchGroupMessagesGlobal(userID uint, q string, perChat, maxChats int, ctx context.Context) ([]models.GlobalSearchRow, error) {
	r.gotPerChat, r.gotMax = perChat, maxChats
	return r.rows, nil
}
func (r *stubGlobalGroupRepo) GetUserGroups(userID uint, ctx context.Context) ([]models.UserGroupRow, error) {
	return r.groups, nil
}

func TestSearchAll_MergesChatsByRecencyWithNamesAndCaps(t *testing.T) {
	base := time.Date(2026, 5, 1, 12, 0, 0, 0, time.UTC)
	chat := &stubGlobalChatRepo{
		rows: []models.GlobalSearchRow{
			{ID: 10, Time: base.Add(-time.Hour), Message: "una canción", ChatID: 2, Total: 2},
			{ID: 8, Time: base.Add(-2 * time.Hour), Message: "otra canción", ChatID: 2, Total: 2},
			{ID: 6, Time: base.Add(-5 * time.Hour), Message: "canción vieja", ChatID: 3, Total: 1},
		},
		contacts: map[uint]string{2: "Luis Alias"},
		users: map[uint]models.UserBasic{
			2: {ID: 2, Telephon: "+2", Username: "luis", AvatarUrl: "/l.png"},
			3: {ID: 3, Telephon: "+3", Username: "marta"},
		},
	}
	grp := &stubGlobalGroupRepo{
		rows:   []models.GlobalSearchRow{{ID: 4, Time: base, Message: "la canción del grupo", ChatID: 7, Total: 1}},
		groups: []models.UserGroupRow{{Group: models.Group{Model: gorm.Model{ID: 7}, Name: "Equipo demo", AvatarUrl: "/g.png"}}},
	}
	svc := InitServiceSearch(chat, grp)

	out, err := svc.SearchAll("+1", " cancion ", 0, 0, context.Background())

	require.NoError(t, err)
	assert.Equal(t, "cancion", chat.gotQ)
	assert.Equal(t, searchGlobalDefaultPerChat, chat.gotPerChat)
	assert.Equal(t, searchGlobalDefaultChats, chat.gotMax)
	assert.Equal(t, searchGlobalDefaultPerChat, grp.gotPerChat)
	require.Len(t, out.Chats, 3)

	// Orden por recencia del primer resultado: grupo, luis (alias), marta (username)
	assert.Equal(t, "group", out.Chats[0].Kind)
	assert.Equal(t, "7", out.Chats[0].Key)
	assert.Equal(t, "Equipo demo", out.Chats[0].Name)
	assert.Equal(t, "/g.png", out.Chats[0].AvatarUrl)
	assert.Equal(t, [][2]int{{3, 10}}, out.Chats[0].Results[0].Highlights)

	assert.Equal(t, "direct", out.Chats[1].Kind)
	assert.Equal(t, "+2", out.Chats[1].Key)
	assert.Equal(t, "Luis Alias", out.Chats[1].Name)
	assert.Equal(t, 2, out.Chats[1].Total)
	assert.Len(t, out.Chats[1].Results, 2)
	assert.Equal(t, uint(10), out.Chats[1].Results[0].MessageID)

	assert.Equal(t, "marta", out.Chats[2].Name)
	assert.Equal(t, "+3", out.Chats[2].Key)
}

func TestSearchAll_CapsTotalChatsAndClampsParams(t *testing.T) {
	base := time.Now()
	var rows []models.GlobalSearchRow
	users := map[uint]models.UserBasic{}
	for i := uint(1); i <= 5; i++ {
		rows = append(rows, models.GlobalSearchRow{ID: i, Time: base.Add(time.Duration(-i) * time.Minute), Message: "hola", ChatID: i, Total: 1})
		users[i] = models.UserBasic{ID: i, Telephon: "+" + string(rune('0'+i)), Username: "u"}
	}
	chat := &stubGlobalChatRepo{rows: rows, users: users}
	svc := InitServiceSearch(chat, &stubGlobalGroupRepo{})

	out, err := svc.SearchAll("+1", "hola", 999, 3, context.Background())

	require.NoError(t, err)
	assert.Len(t, out.Chats, 3, "tope global de chats")
	assert.Equal(t, searchGlobalMaxPerChat, chat.gotPerChat)
	assert.Equal(t, 3, chat.gotMax)

	_, err = svc.SearchAll("+1", "hola", 1, 9999, context.Background())
	require.NoError(t, err)
	assert.Equal(t, searchGlobalMaxChats, chat.gotMax)
}

func TestSearchAll_InvalidQueryDoesNotHitRepos(t *testing.T) {
	chat := &stubGlobalChatRepo{}
	_, err := InitServiceSearch(chat, &stubGlobalGroupRepo{}).SearchAll("+1", "a", 3, 20, context.Background())
	assert.ErrorIs(t, err, ErrInvalidSearchQuery)
	assert.False(t, chat.called)
}

func TestSearchAll_NoResultsIsEmptyNotNil(t *testing.T) {
	out, err := InitServiceSearch(&stubGlobalChatRepo{}, &stubGlobalGroupRepo{}).SearchAll("+1", "hola", 3, 20, context.Background())
	require.NoError(t, err)
	assert.NotNil(t, out.Chats)
	assert.Empty(t, out.Chats)
}
