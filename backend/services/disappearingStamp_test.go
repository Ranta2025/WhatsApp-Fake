package services

import (
	"context"
	"errors"
	"testing"
	"time"

	"gorm/backend/models"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

var stampNow = time.Date(2026, 10, 3, 12, 0, 0, 0, time.UTC)

func stampClock() time.Time { return stampNow }

// ── 1:1 ──────────────────────────────────────────────────────────────────────

type stubStampChatRepo struct {
	ChatRepoInterface
	ids     map[string]int
	seconds int
	created *models.Message
	byID    map[uint]*models.Message
}

func (r *stubStampChatRepo) GetIdByTelephon(telephon string, ctx context.Context) (int, error) {
	id, ok := r.ids[telephon]
	if !ok {
		return 0, models.ErrUserNotFound
	}
	return id, nil
}
func (r *stubStampChatRepo) GetChatDisappearing(a, b uint, ctx context.Context) (int, error) {
	return r.seconds, nil
}
func (r *stubStampChatRepo) CreateMessage(msg *models.Message, ctx context.Context) error {
	msg.ID = 5
	r.created = msg
	return nil
}
func (r *stubStampChatRepo) GetMessageByID(id uint, ctx context.Context) (*models.Message, error) {
	if m, ok := r.byID[id]; ok {
		return m, nil
	}
	return nil, gorm.ErrRecordNotFound
}

func sendDirect(t *testing.T, seconds int) (*stubStampChatRepo, *ServiceChat, error) {
	t.Helper()
	repo := &stubStampChatRepo{ids: map[string]int{"+ana": 1, "+luis": 2}, seconds: seconds}
	svc := &ServiceChat{repo: repo, now: stampClock}
	_, err := svc.ServiceCreatMessage(models.MessageCreat{
		Telephon:   "+ana",
		MessageGet: models.MessageGet{Receptor: "+luis", Message: "hola"},
	}, context.Background())
	return repo, svc, err
}

func TestCreateDirectMessage_NoTimerLeavesExpiresAtNil(t *testing.T) {
	repo, _, err := sendDirect(t, 0)
	require.NoError(t, err)
	require.NotNil(t, repo.created)
	assert.Nil(t, repo.created.ExpiresAt)
}

func TestCreateDirectMessage_StampsNowPlusTimer(t *testing.T) {
	repo, _, err := sendDirect(t, 86400)
	require.NoError(t, err)
	require.NotNil(t, repo.created.ExpiresAt)
	assert.True(t, repo.created.ExpiresAt.Equal(stampNow.Add(24*time.Hour)))
	assert.True(t, repo.created.Time.Equal(stampNow))
}

func TestCreateDirectMessage_ReplyToSystemMessageRejected(t *testing.T) {
	repo := &stubStampChatRepo{
		ids: map[string]int{"+ana": 1, "+luis": 2},
		byID: map[uint]*models.Message{
			9: {Model: gorm.Model{ID: 9}, Kind: models.MessageKindSystem},
		},
	}
	svc := &ServiceChat{repo: repo, now: stampClock}
	id := uint(9)

	_, err := svc.ServiceCreatMessage(models.MessageCreat{
		Telephon:   "+ana",
		MessageGet: models.MessageGet{Receptor: "+luis", Message: "hola", ReplyToMessageID: &id},
	}, context.Background())

	assert.EqualError(t, err, "no puedes responder a un mensaje de sistema")
	assert.Nil(t, repo.created)
}

func TestMessageToSchema_ExposesKindSystemEventAndExpiry(t *testing.T) {
	exp := stampNow.Add(time.Hour)
	out := messageToSchema(&models.Message{
		Kind: models.MessageKindSystem, SystemEvent: models.SystemEventDisappearingChanged, ExpiresAt: &exp,
	}, "+a", "+b")
	assert.Equal(t, models.MessageKindSystem, out.Kind)
	assert.Equal(t, models.SystemEventDisappearingChanged, out.SystemEvent)
	require.NotNil(t, out.ExpiresAt)
	assert.True(t, out.ExpiresAt.Equal(exp))
}

// ── resolveChatPair ──────────────────────────────────────────────────────────

func TestResolveChatPair_OnlyNotFoundMapsToReceptorNoExiste(t *testing.T) {
	boom := errors.New("db down")
	cases := []struct {
		name    string
		err     error
		wantMsg string
		wantIs  error
	}{
		{"not found", models.ErrUserNotFound, "el receptor no existe", nil},
		{"gorm not found", gorm.ErrRecordNotFound, "el receptor no existe", nil},
		{"db error propagates", boom, "", boom},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repo := &errContactRepo{err: tc.err}
			svc := &ServiceChat{repo: repo}
			_, _, err := svc.resolveChatPair("+ana", "+luis", context.Background())
			require.Error(t, err)
			if tc.wantIs != nil {
				assert.ErrorIs(t, err, tc.wantIs)
			} else {
				assert.EqualError(t, err, tc.wantMsg)
			}
		})
	}
}

type errContactRepo struct {
	ChatRepoInterface
	err error
}

func (r *errContactRepo) GetIdByTelephon(telephon string, ctx context.Context) (int, error) {
	if telephon == "+ana" {
		return 1, nil
	}
	return 0, r.err
}

// ── Grupo ────────────────────────────────────────────────────────────────────

func sendGroupWithTimer(t *testing.T, seconds int) *models.GroupMessage {
	t.Helper()
	svc, repo, contacts := newGroupServiceForSend()
	svc.(*ServiceGroup).now = stampClock
	contacts.On("GetIdByTelephon", testSenderTel, mock.Anything).Return(testSenderID, nil)
	contacts.On("GetUsernameByTelephon", testSenderTel, mock.Anything).Return("ana", nil)
	repo.On("GetMemberRole", testGroupID, uint(testSenderID), mock.Anything).Return(models.GroupRoleMember, nil)
	repo.On("GetGroupByID", testGroupID, mock.Anything).Return(&models.Group{DisappearSeconds: seconds}, nil)
	var got *models.GroupMessage
	repo.On("CreateGroupMessage", mock.Anything, mock.Anything).Return(nil).Run(func(args mock.Arguments) {
		got = args.Get(0).(*models.GroupMessage)
	})
	resp, err := svc.SendGroupMessage(testSenderTel, models.GroupMessageSend{GroupID: testGroupID, Message: "hola"}, context.Background())
	require.NoError(t, err)
	require.NotNil(t, got)
	if seconds > 0 {
		require.NotNil(t, resp.ExpiresAt, "la respuesta expone ExpiresAt")
		assert.True(t, resp.ExpiresAt.Equal(*got.ExpiresAt))
	} else {
		assert.Nil(t, resp.ExpiresAt)
	}
	return got
}

func TestSendGroupMessage_NoTimerLeavesExpiresAtNil(t *testing.T) {
	assert.Nil(t, sendGroupWithTimer(t, 0).ExpiresAt)
}

func TestSendGroupMessage_StampsNowPlusTimer(t *testing.T) {
	got := sendGroupWithTimer(t, 86400)
	require.NotNil(t, got.ExpiresAt)
	assert.True(t, got.ExpiresAt.Equal(stampNow.Add(24*time.Hour)))
}

func TestGroupMessageToSchema_ExposesExpiry(t *testing.T) {
	exp := stampNow.Add(time.Hour)
	out := groupMessageToSchema(&models.GroupMessage{ExpiresAt: &exp}, "+a", "ana")
	require.NotNil(t, out.ExpiresAt)
	assert.True(t, out.ExpiresAt.Equal(exp))
}

func TestSystemMessagesNeverStamped(t *testing.T) {
	// El mensaje de sistema 1:1 y de grupo no pasan por el sellado: se construyen
	// sin ExpiresAt aunque haya temporizador activo.
	svc, repo := newDisappearChat(true)
	repo.current = 86400
	_, msg, err := svc.SetChatDisappearing("+ana", "+luis", 604800, context.Background())
	require.NoError(t, err)
	require.NotNil(t, repo.gotMsg)
	assert.Nil(t, repo.gotMsg.ExpiresAt)
	assert.Nil(t, msg.ExpiresAt)
}

type stubTimersChatRepo struct {
	stubAllChatsRepo
	calls int
}

func (r *stubTimersChatRepo) GetChatDisappearingForUser(userID uint, ctx context.Context) (map[uint]int, error) {
	r.calls++
	return map[uint]int{2: 604800}, nil
}

func TestAllChats_ExposesDisappearSecondsWithOneTimersQuery(t *testing.T) {
	repo := &stubTimersChatRepo{stubAllChatsRepo: stubAllChatsRepo{recent: []models.Message{
		{Model: gorm.Model{ID: 10}, IdUser: 1, IdReceptor: 2},
		{Model: gorm.Model{ID: 11}, IdUser: 3, IdReceptor: 1},
	}}}
	chats, err := InitServiceMessage(repo).ServiceGetAllChats("user", context.Background())
	require.NoError(t, err)
	require.Len(t, chats, 2)
	assert.Equal(t, 1, repo.calls)
	withTimer := 0
	for _, c := range chats {
		if c.DisappearSeconds == 604800 {
			withTimer++
		}
	}
	assert.Equal(t, 1, withTimer)
}
