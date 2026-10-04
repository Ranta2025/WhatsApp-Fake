package services

import (
	"context"
	"errors"
	"testing"
	"time"

	"gorm/backend/models"
	"gorm/backend/schemas"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

const (
	muteMe    = "+51900000001"
	mutePeer  = "+51900000002"
	muteMeID  = 1
	mutePeerI = 2
)

var muteClock = time.Date(2026, 10, 4, 12, 0, 0, 0, time.UTC)

func newMuteService(repo *MockMuteRepo, groups *MockGroupRepo) *ServiceMute {
	s := InitServiceMute(repo, groups).(*ServiceMute)
	s.now = func() time.Time { return muteClock }
	return s
}

func muteRepoWithUsers() *MockMuteRepo {
	repo := new(MockMuteRepo)
	repo.On("GetIdByTelephon", muteMe, mock.Anything).Return(muteMeID, nil).Maybe()
	repo.On("GetIdByTelephon", mutePeer, mock.Anything).Return(mutePeerI, nil).Maybe()
	return repo
}

func TestServiceMuteSetDirectDurations(t *testing.T) {
	cases := []struct {
		duration string
		until    *time.Time
	}{
		{"8h", ptrTime(muteClock.Add(8 * time.Hour))},
		{"1w", ptrTime(muteClock.Add(7 * 24 * time.Hour))},
		{"always", nil},
	}
	for _, tc := range cases {
		t.Run(tc.duration, func(t *testing.T) {
			repo := muteRepoWithUsers()
			var saved *models.ChatMute
			repo.On("UpsertMute", mock.Anything, mock.Anything).Run(func(a mock.Arguments) {
				saved = a.Get(0).(*models.ChatMute)
			}).Return(nil)

			res, err := newMuteService(repo, nil).SetMute(muteMe, MuteTarget{Kind: models.ChatKindDirect, Telephon: mutePeer}, tc.duration, context.Background())
			require.NoError(t, err)

			require.NotNil(t, saved)
			assert.Equal(t, uint(muteMeID), saved.UserID)
			assert.Equal(t, models.ChatKindDirect, saved.ChatKind)
			assert.Equal(t, uint(mutePeerI), saved.TargetID)
			assert.Equal(t, tc.until, saved.MutedUntil)
			assert.Equal(t, schemas.MuteResponse{Muted: true, MutedUntil: tc.until}, res)
		})
	}
}

func ptrTime(t time.Time) *time.Time { return &t }

func TestServiceMuteInvalidDuration(t *testing.T) {
	for _, d := range []string{"", "8H", "2h", "forever", "1d", " 8h"} {
		repo := muteRepoWithUsers()
		_, err := newMuteService(repo, nil).SetMute(muteMe, MuteTarget{Kind: models.ChatKindDirect, Telephon: mutePeer}, d, context.Background())
		assert.ErrorIs(t, err, ErrMuteInvalidDuration, "%q", d)
		repo.AssertNotCalled(t, "UpsertMute", mock.Anything, mock.Anything)
	}
}

func TestServiceMuteInvalidKind(t *testing.T) {
	repo := muteRepoWithUsers()
	_, err := newMuteService(repo, nil).SetMute(muteMe, MuteTarget{Kind: "canal", Telephon: mutePeer}, "8h", context.Background())
	assert.ErrorIs(t, err, ErrMuteChatNotFound)
}

func TestServiceMuteDirectUnknownOrSelfIsNotFound(t *testing.T) {
	repo := muteRepoWithUsers()
	repo.On("GetIdByTelephon", "+51999", mock.Anything).Return(-1, models.ErrUserNotFound)
	s := newMuteService(repo, nil)

	_, err := s.SetMute(muteMe, MuteTarget{Kind: models.ChatKindDirect, Telephon: "+51999"}, "8h", context.Background())
	assert.ErrorIs(t, err, ErrMuteChatNotFound)
	_, err = s.SetMute(muteMe, MuteTarget{Kind: models.ChatKindDirect, Telephon: muteMe}, "8h", context.Background())
	assert.ErrorIs(t, err, ErrMuteChatNotFound, "no se silencia el chat con uno mismo")
	assert.ErrorIs(t, s.ClearMute(muteMe, MuteTarget{Kind: models.ChatKindDirect, Telephon: "+51999"}, context.Background()), ErrMuteChatNotFound)
	repo.AssertNotCalled(t, "UpsertMute", mock.Anything, mock.Anything)
	repo.AssertNotCalled(t, "DeleteMute", mock.Anything, mock.Anything, mock.Anything, mock.Anything)
}

// Un fallo de infraestructura al resolver el destino no es un 404.
func TestServiceMuteDirectLookupInfraErrorPropagates(t *testing.T) {
	repo := muteRepoWithUsers()
	boom := errors.New("redis caído")
	repo.On("GetIdByTelephon", "+51888", mock.Anything).Return(-1, boom)
	_, err := newMuteService(repo, nil).SetMute(muteMe, MuteTarget{Kind: models.ChatKindDirect, Telephon: "+51888"}, "8h", context.Background())
	assert.ErrorIs(t, err, boom)
	assert.NotErrorIs(t, err, ErrMuteChatNotFound)
}

func TestServiceMuteGroupRequiresMembership(t *testing.T) {
	repo := muteRepoWithUsers()
	groups := new(MockGroupRepo)
	groups.On("IsMember", uint(7), uint(muteMeID), mock.Anything).Return(false, nil)
	s := newMuteService(repo, groups)

	_, err := s.SetMute(muteMe, MuteTarget{Kind: models.ChatKindGroup, GroupID: 7}, "always", context.Background())
	assert.ErrorIs(t, err, ErrNotGroupMember)
	assert.ErrorIs(t, s.ClearMute(muteMe, MuteTarget{Kind: models.ChatKindGroup, GroupID: 7}, context.Background()), ErrNotGroupMember)
	repo.AssertNotCalled(t, "UpsertMute", mock.Anything, mock.Anything)
	repo.AssertNotCalled(t, "DeleteMute", mock.Anything, mock.Anything, mock.Anything, mock.Anything)
}

func TestServiceMuteGroupMember(t *testing.T) {
	repo := muteRepoWithUsers()
	groups := new(MockGroupRepo)
	groups.On("IsMember", uint(7), uint(muteMeID), mock.Anything).Return(true, nil)
	repo.On("UpsertMute", mock.MatchedBy(func(m *models.ChatMute) bool {
		return m.UserID == muteMeID && m.ChatKind == models.ChatKindGroup && m.TargetID == 7 && m.MutedUntil == nil
	}), mock.Anything).Return(nil)
	repo.On("DeleteMute", uint(muteMeID), models.ChatKindGroup, uint(7), mock.Anything).Return(nil)
	s := newMuteService(repo, groups)

	res, err := s.SetMute(muteMe, MuteTarget{Kind: models.ChatKindGroup, GroupID: 7}, "always", context.Background())
	require.NoError(t, err)
	assert.Equal(t, schemas.MuteResponse{Muted: true}, res)
	require.NoError(t, s.ClearMute(muteMe, MuteTarget{Kind: models.ChatKindGroup, GroupID: 7}, context.Background()))
	repo.AssertExpectations(t)
}

// Quitar un silencio que no existe no es error (el repo borra 0 filas).
func TestServiceMuteClearIsIdempotent(t *testing.T) {
	repo := muteRepoWithUsers()
	repo.On("DeleteMute", uint(muteMeID), models.ChatKindDirect, uint(mutePeerI), mock.Anything).Return(nil).Twice()
	s := newMuteService(repo, nil)
	target := MuteTarget{Kind: models.ChatKindDirect, Telephon: mutePeer}
	require.NoError(t, s.ClearMute(muteMe, target, context.Background()))
	require.NoError(t, s.ClearMute(muteMe, target, context.Background()))
	repo.AssertExpectations(t)
}

// ─────────────────────────────────────────────────────────────────────────────
// Estado de silencio en los listados
// ─────────────────────────────────────────────────────────────────────────────

func TestServiceMuteDecorateLists(t *testing.T) {
	until := muteClock.Add(8 * time.Hour)
	repo := muteRepoWithUsers()
	// El repo ya filtra los vencidos con now: el servicio pasa su reloj.
	repo.On("ListActiveMutes", uint(muteMeID), muteClock, mock.Anything).Return([]models.ActiveMute{
		{ChatKind: models.ChatKindDirect, TargetID: mutePeerI, PeerTelephon: mutePeer, MutedUntil: &until},
		{ChatKind: models.ChatKindDirect, TargetID: 3, PeerTelephon: "+51900000003"},
		{ChatKind: models.ChatKindGroup, TargetID: 7},
		{ChatKind: models.ChatKindGroup, TargetID: 8, MutedUntil: &until},
	}, nil)
	s := newMuteService(repo, nil)
	ctx := context.Background()

	chats := []schemas.ChatGroup{{ContactTelephon: mutePeer}, {ContactTelephon: "+51900000003"}, {ContactTelephon: "+51900000004"}}
	require.NoError(t, s.DecorateChats(muteMe, chats, ctx))
	assert.True(t, chats[0].Muted)
	assert.Equal(t, &until, chats[0].MutedUntil)
	assert.True(t, chats[1].Muted)
	assert.Nil(t, chats[1].MutedUntil, "para siempre")
	assert.False(t, chats[2].Muted)

	contacts := []models.ContactChat{{Number: mutePeer}, {Number: "+51900000004"}}
	require.NoError(t, s.DecorateContacts(muteMe, contacts, ctx))
	assert.True(t, contacts[0].Muted)
	assert.Equal(t, &until, contacts[0].MutedUntil)
	assert.False(t, contacts[1].Muted)

	groups := []schemas.GroupResponse{{ID: 7}, {ID: 8}, {ID: 9}}
	require.NoError(t, s.DecorateGroups(muteMe, groups, ctx))
	assert.True(t, groups[0].Muted)
	assert.Nil(t, groups[0].MutedUntil)
	assert.True(t, groups[1].Muted)
	assert.Equal(t, &until, groups[1].MutedUntil)
	assert.False(t, groups[2].Muted)
}

func TestServiceMuteDecorateEmptyListSkipsQuery(t *testing.T) {
	repo := new(MockMuteRepo)
	s := newMuteService(repo, nil)
	require.NoError(t, s.DecorateChats(muteMe, nil, context.Background()))
	require.NoError(t, s.DecorateContacts(muteMe, nil, context.Background()))
	require.NoError(t, s.DecorateGroups(muteMe, nil, context.Background()))
	repo.AssertNotCalled(t, "GetIdByTelephon", mock.Anything, mock.Anything)
}

func TestServiceMuteDecorateError(t *testing.T) {
	repo := muteRepoWithUsers()
	repo.On("ListActiveMutes", uint(muteMeID), muteClock, mock.Anything).Return(nil, errors.New("db"))
	chats := []schemas.ChatGroup{{ContactTelephon: mutePeer}}
	assert.Error(t, newMuteService(repo, nil).DecorateChats(muteMe, chats, context.Background()))
	assert.False(t, chats[0].Muted)
}
