package services

import (
	"context"
	"errors"
	"gorm/backend/models"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type reactionKey struct {
	kind  string
	msgID uint
	user  uint
}

// fakeReactionRepo imita las garantías del repo real: una reacción por
// (kind, message, user) y visibilidad configurada por el test.
type fakeReactionRepo struct {
	direct    map[uint]models.ReactionTarget // messageID -> target (solo visibles para visibleTo)
	visibleTo map[uint][]uint                // messageID -> usuarios que lo ven
	group     map[uint]models.ReactionTarget // messageID -> target (GroupID dentro)
	members   map[[2]uint]bool               // {groupID,userID}
	rows      map[reactionKey]string
	upserts   int
	deletes   int
}

func newFakeReactionRepo() *fakeReactionRepo {
	return &fakeReactionRepo{
		direct:    map[uint]models.ReactionTarget{},
		visibleTo: map[uint][]uint{},
		group:     map[uint]models.ReactionTarget{},
		members:   map[[2]uint]bool{},
		rows:      map[reactionKey]string{},
	}
}

func (f *fakeReactionRepo) DirectMessageTarget(messageID, userID uint, _ context.Context) (*models.ReactionTarget, error) {
	for _, u := range f.visibleTo[messageID] {
		if u == userID {
			t := f.direct[messageID] // OtherUserID guarda el receptor
			other := t.OtherUserID
			if userID == t.OtherUserID {
				other = t.AuthorID
			}
			return &models.ReactionTarget{AuthorID: t.AuthorID, OtherUserID: other}, nil
		}
	}
	return nil, models.ErrMessageNotFound
}

func (f *fakeReactionRepo) GroupMessageTarget(groupID, messageID uint, _ context.Context) (*models.ReactionTarget, error) {
	t, ok := f.group[messageID]
	if !ok || t.GroupID != groupID {
		return nil, models.ErrGroupMessageNotFound
	}
	return &t, nil
}

func (f *fakeReactionRepo) IsGroupMember(groupID, userID uint, _ context.Context) (bool, error) {
	return f.members[[2]uint{groupID, userID}], nil
}

func (f *fakeReactionRepo) UpsertReaction(kind string, messageID, userID uint, emoji string, _ context.Context) error {
	f.upserts++
	f.rows[reactionKey{kind, messageID, userID}] = emoji
	return nil
}

func (f *fakeReactionRepo) DeleteReaction(kind string, messageID, userID uint, _ context.Context) error {
	f.deletes++
	delete(f.rows, reactionKey{kind, messageID, userID})
	return nil
}

func (f *fakeReactionRepo) ListReactionUsers(kind string, messageID uint, _ context.Context) ([]models.ReactionUsers, error) {
	var out []models.ReactionUsers
	for k, e := range f.rows {
		if k.kind == kind && k.msgID == messageID {
			out = append(out, models.ReactionUsers{Emoji: e, Users: []models.ReactionUser{{Telephon: "u"}}})
		}
	}
	return out, nil
}

const (
	userA uint = 1
	userB uint = 2
	userC uint = 3
)

func reactionFixture() (*ReactionService, *fakeReactionRepo, *time.Time) {
	repo := newFakeReactionRepo()
	// mensaje 1:1 id 10 de A hacia B; visible para ambos
	repo.direct[10] = models.ReactionTarget{AuthorID: userA, OtherUserID: userB}
	repo.visibleTo[10] = []uint{userA, userB}
	// mensaje 1:1 id 11 de A hacia B pero B lo borró para sí: solo lo ve A
	repo.direct[11] = models.ReactionTarget{AuthorID: userA, OtherUserID: userB}
	repo.visibleTo[11] = []uint{userA}
	// mensaje de grupo 20 (grupo 5), sistema 21 (grupo 5), mensaje de otro grupo 22 (grupo 6)
	repo.group[20] = models.ReactionTarget{AuthorID: userA, GroupID: 5}
	repo.members[[2]uint{5, userA}] = true
	repo.members[[2]uint{5, userB}] = true
	now := time.Unix(1000, 0)
	svc := NewReactionService(repo)
	svc.now = func() time.Time { return now }
	return svc, repo, &now
}

func TestSetReaction_Direct_ReplaceOnChange(t *testing.T) {
	svc, repo, _ := reactionFixture()
	ctx := context.Background()

	ch, err := svc.SetReaction(userB, models.ReactionKindDirect, 10, 0, "👍", ctx)
	require.NoError(t, err)
	assert.Equal(t, "👍", ch.Emoji)
	assert.False(t, ch.Removed)
	assert.Equal(t, userA, ch.AuthorID)
	assert.Equal(t, userA, ch.OtherUserID, "para B, el otro participante es A")
	assert.Equal(t, userB, ch.UserID)

	_, err = svc.SetReaction(userB, models.ReactionKindDirect, 10, 0, "❤️", ctx)
	require.NoError(t, err)
	assert.Equal(t, "❤️", repo.rows[reactionKey{models.ReactionKindDirect, 10, userB}])
	assert.Len(t, repo.rows, 1, "una sola reacción por usuario y mensaje")
}

func TestSetReaction_OtherParticipantForAuthor(t *testing.T) {
	svc, _, _ := reactionFixture()
	ch, err := svc.SetReaction(userA, models.ReactionKindDirect, 10, 0, "😂", context.Background())
	require.NoError(t, err)
	assert.Equal(t, userB, ch.OtherUserID)
}

func TestSetReaction_EmptyEmojiRemoves(t *testing.T) {
	svc, repo, _ := reactionFixture()
	ctx := context.Background()
	_, err := svc.SetReaction(userB, models.ReactionKindDirect, 10, 0, "👍", ctx)
	require.NoError(t, err)

	ch, err := svc.SetReaction(userB, models.ReactionKindDirect, 10, 0, "", ctx)
	require.NoError(t, err)
	assert.True(t, ch.Removed)
	assert.Equal(t, "", ch.Emoji)
	assert.Empty(t, repo.rows)
	assert.Equal(t, 1, repo.deletes)
}

func TestSetReaction_Direct_InvisibleIsNotFound(t *testing.T) {
	svc, repo, _ := reactionFixture()
	ctx := context.Background()
	// B borró el mensaje 11 para sí
	_, err := svc.SetReaction(userB, models.ReactionKindDirect, 11, 0, "👍", ctx)
	assert.ErrorIs(t, err, models.ErrMessageNotFound)
	// un tercero no participante
	_, err = svc.SetReaction(userC, models.ReactionKindDirect, 10, 0, "👍", ctx)
	assert.ErrorIs(t, err, models.ErrMessageNotFound)
	// inexistente, también al quitar
	_, err = svc.SetReaction(userB, models.ReactionKindDirect, 999, 0, "", ctx)
	assert.ErrorIs(t, err, models.ErrMessageNotFound)
	assert.Zero(t, repo.upserts+repo.deletes)
}

func TestSetReaction_Group(t *testing.T) {
	svc, repo, _ := reactionFixture()
	ctx := context.Background()

	ch, err := svc.SetReaction(userB, models.ReactionKindGroup, 20, 5, "🙏", ctx)
	require.NoError(t, err)
	assert.Equal(t, uint(5), ch.GroupID)
	assert.Equal(t, userA, ch.AuthorID)
	assert.Equal(t, "🙏", repo.rows[reactionKey{models.ReactionKindGroup, 20, userB}])

	// el usuario puede reaccionar a su propio mensaje
	_, err = svc.SetReaction(userA, models.ReactionKindGroup, 20, 5, "👍", ctx)
	assert.NoError(t, err)
}

func TestSetReaction_Group_NonMemberIsForbidden(t *testing.T) {
	svc, repo, _ := reactionFixture()
	_, err := svc.SetReaction(userC, models.ReactionKindGroup, 20, 5, "👍", context.Background())
	assert.ErrorIs(t, err, models.ErrNotGroupMember)
	assert.Zero(t, repo.upserts)
}

func TestSetReaction_Group_MessageNotFound(t *testing.T) {
	svc, repo, _ := reactionFixture()
	ctx := context.Background()
	// mensaje de sistema / borrado / inexistente: el repo no lo devuelve
	_, err := svc.SetReaction(userB, models.ReactionKindGroup, 21, 5, "👍", ctx)
	assert.ErrorIs(t, err, ErrGroupMessageNotFound)
	// mensaje de otro grupo
	repo.group[22] = models.ReactionTarget{AuthorID: userA, GroupID: 6}
	_, err = svc.SetReaction(userB, models.ReactionKindGroup, 22, 5, "👍", ctx)
	assert.ErrorIs(t, err, ErrGroupMessageNotFound)
}

func TestSetReaction_InvalidInput(t *testing.T) {
	svc, repo, _ := reactionFixture()
	ctx := context.Background()
	_, err := svc.SetReaction(userB, models.ReactionKindDirect, 10, 0, "ok", ctx)
	assert.ErrorIs(t, err, ErrInvalidReactionEmoji)
	_, err = svc.SetReaction(userB, "channel", 10, 0, "👍", ctx)
	assert.ErrorIs(t, err, ErrInvalidReactionKind)
	assert.Zero(t, repo.upserts)
}

func TestSetReaction_RateLimit(t *testing.T) {
	svc, _, now := reactionFixture()
	ctx := context.Background()
	for i := 0; i < reactionRateMax; i++ {
		_, err := svc.SetReaction(userB, models.ReactionKindDirect, 10, 0, "👍", ctx)
		require.NoError(t, err, "reaction %d", i)
	}
	_, err := svc.SetReaction(userB, models.ReactionKindDirect, 10, 0, "❤️", ctx)
	assert.ErrorIs(t, err, ErrReactionRateLimited)

	// otro usuario no se ve afectado
	_, err = svc.SetReaction(userA, models.ReactionKindDirect, 10, 0, "👍", ctx)
	assert.NoError(t, err)

	// pasada la ventana se libera
	*now = now.Add(reactionRateWindow + time.Millisecond)
	_, err = svc.SetReaction(userB, models.ReactionKindDirect, 10, 0, "❤️", ctx)
	assert.NoError(t, err)
}

func TestListReactions_Authorization(t *testing.T) {
	svc, repo, _ := reactionFixture()
	ctx := context.Background()
	repo.rows[reactionKey{models.ReactionKindDirect, 10, userA}] = "👍"

	got, err := svc.ListReactions(userB, models.ReactionKindDirect, 10, 0, ctx)
	require.NoError(t, err)
	assert.Len(t, got, 1)

	_, err = svc.ListReactions(userC, models.ReactionKindDirect, 10, 0, ctx)
	assert.ErrorIs(t, err, models.ErrMessageNotFound)
	_, err = svc.ListReactions(userB, models.ReactionKindDirect, 11, 0, ctx)
	assert.ErrorIs(t, err, models.ErrMessageNotFound)

	_, err = svc.ListReactions(userC, models.ReactionKindGroup, 20, 5, ctx)
	assert.ErrorIs(t, err, models.ErrNotGroupMember)
	_, err = svc.ListReactions(userB, models.ReactionKindGroup, 21, 5, ctx)
	assert.ErrorIs(t, err, ErrGroupMessageNotFound)
	_, err = svc.ListReactions(userB, models.ReactionKindGroup, 20, 5, ctx)
	assert.NoError(t, err)
}

func TestSetReaction_RepoErrorPropagates(t *testing.T) {
	svc, repo, _ := reactionFixture()
	boom := errors.New("boom")
	failing := &failingUpsertRepo{fakeReactionRepo: repo, err: boom}
	svc.repo = failing
	_, err := svc.SetReaction(userB, models.ReactionKindDirect, 10, 0, "👍", context.Background())
	assert.ErrorIs(t, err, boom)
}

type failingUpsertRepo struct {
	*fakeReactionRepo
	err error
}

func (f *failingUpsertRepo) UpsertReaction(string, uint, uint, string, context.Context) error {
	return f.err
}
