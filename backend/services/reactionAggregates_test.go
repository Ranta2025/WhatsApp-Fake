package services

import (
	"context"
	"encoding/json"
	"errors"
	"gorm/backend/models"
	"gorm/backend/repos"
	"gorm/backend/schemas"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// fakeAggregator cuenta llamadas y registra (kind, ids, viewer) de cada una.
type fakeAggregator struct {
	byID  map[uint][]models.ReactionAggregate
	err   error
	calls []aggCall
}

type aggCall struct {
	kind   string
	ids    []uint
	viewer uint
}

func (f *fakeAggregator) ReactionsForMessages(kind string, ids []uint, viewerID uint, ctx context.Context) (map[uint][]models.ReactionAggregate, error) {
	f.calls = append(f.calls, aggCall{kind, append([]uint(nil), ids...), viewerID})
	if f.err != nil {
		return nil, f.err
	}
	return f.byID, nil
}

var thumbs = []models.ReactionAggregate{{Emoji: "👍", Count: 2, Mine: true}}

func directMsgs(ids ...uint) []models.Message {
	out := make([]models.Message, 0, len(ids))
	for _, id := range ids {
		out = append(out, models.Message{Model: gorm.Model{ID: id}, IdUser: 1, IdReceptor: 2})
	}
	return out
}

func groupMsgs(ids ...uint) []models.GroupMessage {
	out := make([]models.GroupMessage, 0, len(ids))
	for _, id := range ids {
		out = append(out, models.GroupMessage{Model: gorm.Model{ID: id}, GroupID: 7})
	}
	return out
}

func assertOneDirectCall(t *testing.T, agg *fakeAggregator, ids ...uint) {
	t.Helper()
	require.Len(t, agg.calls, 1)
	assert.Equal(t, models.ReactionKindDirect, agg.calls[0].kind)
	assert.ElementsMatch(t, ids, agg.calls[0].ids)
	assert.Equal(t, uint(1), agg.calls[0].viewer)
}

func assertOneGroupCall(t *testing.T, agg *fakeAggregator, viewer uint, ids ...uint) {
	t.Helper()
	require.Len(t, agg.calls, 1)
	assert.Equal(t, models.ReactionKindGroup, agg.calls[0].kind)
	assert.ElementsMatch(t, ids, agg.calls[0].ids)
	assert.Equal(t, viewer, agg.calls[0].viewer)
}

func wantThumbs() []schemas.ReactionSummary {
	return []schemas.ReactionSummary{{Emoji: "👍", Count: 2, Mine: true}}
}

// ── 1:1 ─────────────────────────────────────────────────────────────────────

func TestChatPage_AttachesReactionsWithOneCall(t *testing.T) {
	agg := &fakeAggregator{byID: map[uint][]models.ReactionAggregate{6: thumbs}}
	svc := InitServiceMessage(&stubPagedChatRepo{messages: directMsgs(5, 6, 7)}, agg)

	msgs, _, err := svc.ServiceGetMessagesPage("user", "contact", 0, 10, context.Background())

	require.NoError(t, err)
	assertOneDirectCall(t, agg, 5, 6, 7)
	require.Len(t, msgs, 3)
	assert.Empty(t, msgs[0].Reactions)
	assert.Equal(t, wantThumbs(), msgs[1].Reactions)
	assert.Empty(t, msgs[2].Reactions)
}

func TestChatWindows_AttachReactionsWithOneCall(t *testing.T) {
	agg := &fakeAggregator{byID: map[uint][]models.ReactionAggregate{5: thumbs}}
	repo := &stubWindowChatRepo{msgs: directMsgs(5, 6)}
	svc := InitServiceMessage(repo, agg)

	msgs, _, _, err := svc.ServiceGetMessagesAround("user", "contact", 5, 20, context.Background())
	require.NoError(t, err)
	assertOneDirectCall(t, agg, 5, 6)
	assert.Equal(t, wantThumbs(), msgs[0].Reactions)
	assert.Empty(t, msgs[1].Reactions)

	agg.calls = nil
	msgs, _, err = svc.ServiceGetMessagesAfter("user", "contact", 4, 20, context.Background())
	require.NoError(t, err)
	assertOneDirectCall(t, agg, 5, 6)
	assert.Equal(t, wantThumbs(), msgs[0].Reactions)
}

func TestChatPage_AggregateErrorIsReturned(t *testing.T) {
	boom := errors.New("boom")
	svc := InitServiceMessage(&stubPagedChatRepo{messages: directMsgs(5)}, &fakeAggregator{err: boom})

	_, _, err := svc.ServiceGetMessagesPage("user", "contact", 0, 10, context.Background())

	assert.ErrorIs(t, err, boom)
}

func TestChatPage_EmptyPageSkipsAggregateQuery(t *testing.T) {
	agg := &fakeAggregator{}
	svc := InitServiceMessage(&stubPagedChatRepo{}, agg)

	_, _, err := svc.ServiceGetMessagesPage("user", "contact", 0, 10, context.Background())

	require.NoError(t, err)
	assert.Empty(t, agg.calls)
}

func TestChatPage_NilAggregatorIsSafe(t *testing.T) {
	svc := InitServiceMessage(&stubPagedChatRepo{messages: directMsgs(5)})

	msgs, _, err := svc.ServiceGetMessagesPage("user", "contact", 0, 10, context.Background())

	require.NoError(t, err)
	assert.Empty(t, msgs[0].Reactions)
}

type stubAllChatsRepo struct {
	ChatRepoInterface
	recent []models.Message
}

func (r *stubAllChatsRepo) GetIdByTelephon(telephon string, ctx context.Context) (int, error) {
	return 1, nil
}
func (r *stubAllChatsRepo) GetRecentMessagesForUser(userID uint, limit int, ctx context.Context) ([]models.Message, error) {
	return r.recent, nil
}
func (r *stubAllChatsRepo) GetAddedContactIDs(userID uint, ctx context.Context) (map[uint]string, error) {
	return map[uint]string{}, nil
}
func (r *stubAllChatsRepo) GetUsersBasicByIDs(ids []uint, ctx context.Context) (map[uint]models.UserBasic, error) {
	out := map[uint]models.UserBasic{}
	for _, id := range ids {
		out[id] = models.UserBasic{Telephon: "tel"}
	}
	return out, nil
}

func TestAllChats_OneCallAcrossAllConversations(t *testing.T) {
	agg := &fakeAggregator{byID: map[uint][]models.ReactionAggregate{11: thumbs}}
	repo := &stubAllChatsRepo{recent: []models.Message{
		{Model: gorm.Model{ID: 10}, IdUser: 1, IdReceptor: 2},
		{Model: gorm.Model{ID: 11}, IdUser: 3, IdReceptor: 1},
	}}
	svc := InitServiceMessage(repo, agg)

	chats, err := svc.ServiceGetAllChats("user", context.Background())

	require.NoError(t, err)
	assertOneDirectCall(t, agg, 10, 11)
	found := false
	for _, c := range chats {
		for _, m := range c.Messages {
			if m.MessageID == 11 {
				found = true
				assert.Equal(t, wantThumbs(), m.Reactions)
			} else {
				assert.Empty(t, m.Reactions)
			}
		}
	}
	assert.True(t, found)
}

// ── Grupos ──────────────────────────────────────────────────────────────────

type stubReactGroupRepo struct {
	GroupRepoInterface
	msgs []models.GroupMessage
}

func (r *stubReactGroupRepo) IsMember(groupID, userID uint, ctx context.Context) (bool, error) {
	return true, nil
}
func (r *stubReactGroupRepo) GetGroupMessagesPage(groupID, before uint, limit, offset int, ctx context.Context) ([]models.GroupMessage, bool, error) {
	return r.msgs, false, nil
}
func (r *stubReactGroupRepo) GetGroupMessagesAround(groupID, around uint, limit int, ctx context.Context) ([]models.GroupMessage, bool, bool, error) {
	return r.msgs, false, false, nil
}
func (r *stubReactGroupRepo) GetGroupMessagesAfter(groupID, after uint, limit int, ctx context.Context) ([]models.GroupMessage, bool, error) {
	return r.msgs, false, nil
}
func (r *stubReactGroupRepo) GetGroupByID(groupID uint, ctx context.Context) (*models.Group, error) {
	return &models.Group{Model: gorm.Model{ID: groupID}}, nil
}
func (r *stubReactGroupRepo) GetGroupMembers(groupID uint, ctx context.Context) ([]models.GroupMember, error) {
	return nil, nil
}
func (r *stubReactGroupRepo) GetGroupMessages(groupID uint, limit, offset int, ctx context.Context) ([]models.GroupMessage, error) {
	return r.msgs, nil
}

// stubGroupContacts (serviceSearch_test.go) resuelve cualquier telefono a 5.
const groupViewerID = 5

func systemGroupMsg(id uint) models.GroupMessage {
	return models.GroupMessage{Model: gorm.Model{ID: id}, GroupID: 7, Kind: models.GroupMessageKindSystem}
}

func TestGroupPage_AttachesReactionsAndSkipsSystemMessages(t *testing.T) {
	agg := &fakeAggregator{byID: map[uint][]models.ReactionAggregate{3: thumbs, 4: thumbs}}
	msgs := append(groupMsgs(2, 3), systemGroupMsg(4))
	svc := InitServiceGroup(&stubReactGroupRepo{msgs: msgs}, stubGroupContacts{}, agg)

	out, _, err := svc.GetGroupMessagesPage("+1", 7, 0, 10, 0, context.Background())

	require.NoError(t, err)
	assertOneGroupCall(t, agg, groupViewerID, 2, 3)
	require.Len(t, out, 3)
	assert.Empty(t, out[0].Reactions)
	assert.Equal(t, wantThumbs(), out[1].Reactions)
	assert.Empty(t, out[2].Reactions, "system messages never carry reactions")
}

func TestGroupWindows_AttachReactionsWithOneCall(t *testing.T) {
	agg := &fakeAggregator{byID: map[uint][]models.ReactionAggregate{2: thumbs}}
	svc := InitServiceGroup(&stubReactGroupRepo{msgs: groupMsgs(2, 3)}, stubGroupContacts{}, agg)

	out, _, _, err := svc.GetGroupMessagesAround("+1", 7, 2, 10, context.Background())
	require.NoError(t, err)
	assertOneGroupCall(t, agg, groupViewerID, 2, 3)
	assert.Equal(t, wantThumbs(), out[0].Reactions)

	agg.calls = nil
	out, _, err = svc.GetGroupMessagesAfter("+1", 7, 1, 10, context.Background())
	require.NoError(t, err)
	assertOneGroupCall(t, agg, groupViewerID, 2, 3)
	assert.Equal(t, wantThumbs(), out[0].Reactions)
}

func TestGroupDetail_AttachesReactionsWithOneCall(t *testing.T) {
	agg := &fakeAggregator{byID: map[uint][]models.ReactionAggregate{3: thumbs}}
	svc := InitServiceGroup(&stubReactGroupRepo{msgs: groupMsgs(2, 3)}, detailContacts{}, agg)

	detail, err := svc.GetGroupDetail("+1", 7, context.Background())

	require.NoError(t, err)
	assertOneGroupCall(t, agg, groupViewerID, 2, 3)
	assert.Equal(t, wantThumbs(), detail.Messages[1].Reactions)
	assert.Empty(t, detail.Messages[0].Reactions)
}

type detailContacts struct{ stubGroupContacts }

func (detailContacts) GetTelephonByID(id uint, ctx context.Context) (string, error) { return "+1", nil }

func TestGroupPage_AggregateErrorIsReturned(t *testing.T) {
	boom := errors.New("boom")
	svc := InitServiceGroup(&stubReactGroupRepo{msgs: groupMsgs(2)}, stubGroupContacts{}, &fakeAggregator{err: boom})

	_, _, err := svc.GetGroupMessagesPage("+1", 7, 0, 10, 0, context.Background())

	assert.ErrorIs(t, err, boom)
}

func TestGroupPage_NilAggregatorIsSafe(t *testing.T) {
	svc := InitServiceGroup(&stubReactGroupRepo{msgs: groupMsgs(2)}, stubGroupContacts{})

	out, _, err := svc.GetGroupMessagesPage("+1", 7, 0, 10, 0, context.Background())

	require.NoError(t, err)
	assert.Empty(t, out[0].Reactions)
}

// ── JSON ────────────────────────────────────────────────────────────────────

func TestReactionsJSON_OmittedWhenEmpty(t *testing.T) {
	for _, v := range []any{schemas.Message{}, schemas.GroupMessageResponse{}} {
		b, err := json.Marshal(v)
		require.NoError(t, err)
		assert.NotContains(t, string(b), "Reactions")
	}
}

func TestReactionsJSON_PascalCaseKeys(t *testing.T) {
	b, err := json.Marshal(schemas.Message{Reactions: wantThumbs()})
	require.NoError(t, err)
	assert.Contains(t, string(b), `"Reactions":[{"Emoji":"👍","Count":2,"Mine":true}]`)
}

// Un *RepoReaction nil dentro de la interfaz no es == nil: el receptor debe ser
// seguro para que una cadena de inicialización incompleta no provoque pánico.
func TestPickAggregator_TypedNilRepoIsSafe(t *testing.T) {
	var nilRepo *repos.RepoReaction
	agg := pickAggregator([]ReactionAggregator{nilRepo})

	got, err := fetchReactions(agg, models.ReactionKindDirect, []uint{1, 2}, 1, context.Background())

	require.NoError(t, err)
	assert.Empty(t, got)
}
