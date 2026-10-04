package services

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"gorm/backend/models"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// ── 1:1 idempotent sends (PW8) ───────────────────────────────────────────────

// stubIdemChatRepo models the (sender, client_id) unique index in memory.
type stubIdemChatRepo struct {
	ChatRepoInterface
	ids        map[string]int
	stored     map[string]models.Message // key: sender id + client id
	plainCalls int
	idemCalls  int
	nextID     uint
}

func newStubIdemChatRepo() *stubIdemChatRepo {
	return &stubIdemChatRepo{
		ids:    map[string]int{"+ana": 1, "+luis": 2, "+eva": 3},
		stored: map[string]models.Message{},
		nextID: 100,
	}
}

func (r *stubIdemChatRepo) GetIdByTelephon(telephon string, ctx context.Context) (int, error) {
	id, ok := r.ids[telephon]
	if !ok {
		return 0, models.ErrUserNotFound
	}
	return id, nil
}
func (r *stubIdemChatRepo) GetChatDisappearing(a, b uint, ctx context.Context) (int, error) {
	return 0, nil
}
func (r *stubIdemChatRepo) CreateMessage(msg *models.Message, ctx context.Context) error {
	r.plainCalls++
	r.nextID++
	msg.ID = r.nextID
	return nil
}
func (r *stubIdemChatRepo) CreateMessageIdempotent(msg *models.Message, ctx context.Context) (bool, error) {
	r.idemCalls++
	key := fmt.Sprintf("%d|%s", msg.IdUser, *msg.ClientID)
	if existing, ok := r.stored[key]; ok {
		*msg = existing
		return true, nil
	}
	r.nextID++
	msg.ID = r.nextID
	r.stored[key] = *msg
	return false, nil
}

func sendDirectWithClientID(svc *ServiceChat, from, to, clientID string) (bool, uint, *string, time.Time, error) {
	msg, err := svc.ServiceCreatMessageWithStatus(models.MessageCreat{
		Telephon:   from,
		MessageGet: models.MessageGet{Receptor: to, Message: "hola", ClientID: clientID},
	}, "enviado", context.Background())
	return msg.Duplicate, msg.MessageID, msg.ClientID, msg.Time, err
}

const testClientID = "3F2504E0-4F89-41D3-9A0C-0305E82C3301"
const testClientIDLower = "3f2504e0-4f89-41d3-9a0c-0305e82c3301"

func TestDirectClientID_FirstSendInsertsNormalized(t *testing.T) {
	repo := newStubIdemChatRepo()
	svc := &ServiceChat{repo: repo, now: stampClock}

	dup, id, cid, _, err := sendDirectWithClientID(svc, "+ana", "+luis", testClientID)

	require.NoError(t, err)
	assert.False(t, dup)
	assert.NotZero(t, id)
	require.NotNil(t, cid)
	assert.Equal(t, testClientIDLower, *cid)
	assert.Equal(t, 1, repo.idemCalls)
	assert.Equal(t, 0, repo.plainCalls)
}

func TestDirectClientID_ReplayReturnsSameMessageAsDuplicate(t *testing.T) {
	repo := newStubIdemChatRepo()
	clock := stampNow
	svc := &ServiceChat{repo: repo, now: func() time.Time { return clock }}

	_, firstID, _, firstTime, err := sendDirectWithClientID(svc, "+ana", "+luis", testClientID)
	require.NoError(t, err)
	clock = clock.Add(time.Minute)
	dup, secondID, cid, secondTime, err := sendDirectWithClientID(svc, "+ana", "+luis", testClientIDLower)

	require.NoError(t, err)
	assert.True(t, dup)
	assert.Equal(t, firstID, secondID)
	assert.True(t, firstTime.Equal(secondTime), "replay keeps the original timestamp")
	require.NotNil(t, cid)
	assert.Equal(t, testClientIDLower, *cid)
}

func TestDirectClientID_InvalidRejectedBeforePersisting(t *testing.T) {
	for _, bad := range []string{"not-a-uuid", "3f2504e0-4f89-41d3-9a0c", "{3f2504e0-4f89-41d3-9a0c-0305e82c3301}", "3f2504e0x4f89x41d3x9a0cx0305e82c3301"} {
		repo := newStubIdemChatRepo()
		svc := &ServiceChat{repo: repo, now: stampClock}

		_, _, _, _, err := sendDirectWithClientID(svc, "+ana", "+luis", bad)

		assert.ErrorIs(t, err, ErrInvalidClientID, bad)
		assert.Equal(t, 0, repo.idemCalls+repo.plainCalls, bad)
	}
}

func TestDirectClientID_AbsentKeepsLegacyInsert(t *testing.T) {
	repo := newStubIdemChatRepo()
	svc := &ServiceChat{repo: repo, now: stampClock}

	dup, _, cid, _, err := sendDirectWithClientID(svc, "+ana", "+luis", "")

	require.NoError(t, err)
	assert.False(t, dup)
	assert.Nil(t, cid)
	assert.Equal(t, 1, repo.plainCalls)
	assert.Equal(t, 0, repo.idemCalls)
}

// Same sender reusing a ClientID for a different receiver is a client bug: the
// stored message is never returned as if it belonged to the new conversation.
func TestDirectClientID_ReuseForOtherReceiverConflicts(t *testing.T) {
	repo := newStubIdemChatRepo()
	svc := &ServiceChat{repo: repo, now: stampClock}

	_, _, _, _, err := sendDirectWithClientID(svc, "+ana", "+luis", testClientID)
	require.NoError(t, err)
	_, _, _, _, err = sendDirectWithClientID(svc, "+ana", "+eva", testClientID)

	assert.ErrorIs(t, err, ErrClientIDConflict)
}

// ── Group idempotent sends (PW8) ─────────────────────────────────────────────

func (m *MockGroupRepo) CreateGroupMessageIdempotent(msg *models.GroupMessage, ctx context.Context) (bool, error) {
	args := m.Called(msg, ctx)
	if stored, ok := args.Get(0).(*models.GroupMessage); ok && stored != nil {
		*msg = *stored
		return true, args.Error(1)
	}
	msg.ID = 900
	return false, args.Error(1)
}

func TestGroupClientID_FirstSendUsesIdempotentInsert(t *testing.T) {
	svc, repo, contacts := newGroupServiceForSend()
	expectMemberSend(repo, contacts)
	repo.On("CreateGroupMessageIdempotent", mock.MatchedBy(func(m *models.GroupMessage) bool {
		return m.ClientID != nil && *m.ClientID == testClientIDLower && m.GroupID == testGroupID
	}), mock.Anything).Return(nil, nil)

	resp, err := svc.SendGroupMessage(testSenderTel, models.GroupMessageSend{
		GroupID: testGroupID, Message: "hola", ClientID: testClientID,
	}, context.Background())

	require.NoError(t, err)
	assert.False(t, resp.Duplicate)
	assert.Equal(t, uint(900), resp.MessageID)
	require.NotNil(t, resp.ClientID)
	assert.Equal(t, testClientIDLower, *resp.ClientID)
	repo.AssertNotCalled(t, "CreateGroupMessage", mock.Anything, mock.Anything)
}

func TestGroupClientID_ReplayReturnsStoredMessage(t *testing.T) {
	svc, repo, contacts := newGroupServiceForSend()
	expectMemberSend(repo, contacts)
	cid := testClientIDLower
	stored := &models.GroupMessage{
		Model:    gorm.Model{ID: 55},
		GroupID:  testGroupID,
		SenderID: testSenderID,
		Message:  "hola",
		Time:     stampNow,
		ClientID: &cid,
	}
	repo.On("CreateGroupMessageIdempotent", mock.Anything, mock.Anything).Return(stored, nil)

	resp, err := svc.SendGroupMessage(testSenderTel, models.GroupMessageSend{
		GroupID: testGroupID, Message: "hola", ClientID: testClientID,
	}, context.Background())

	require.NoError(t, err)
	assert.True(t, resp.Duplicate)
	assert.Equal(t, uint(55), resp.MessageID)
	assert.True(t, resp.Time.Equal(stampNow))
}

func TestGroupClientID_ReuseInOtherGroupConflicts(t *testing.T) {
	svc, repo, contacts := newGroupServiceForSend()
	expectMemberSend(repo, contacts)
	cid := testClientIDLower
	stored := &models.GroupMessage{Model: gorm.Model{ID: 55}, GroupID: testGroupID + 1, SenderID: testSenderID, ClientID: &cid}
	repo.On("CreateGroupMessageIdempotent", mock.Anything, mock.Anything).Return(stored, nil)

	resp, err := svc.SendGroupMessage(testSenderTel, models.GroupMessageSend{
		GroupID: testGroupID, Message: "hola", ClientID: testClientID,
	}, context.Background())

	assert.Nil(t, resp)
	assert.ErrorIs(t, err, ErrClientIDConflict)
}

func TestGroupClientID_InvalidRejected(t *testing.T) {
	svc, repo, _ := newGroupServiceForSend()

	resp, err := svc.SendGroupMessage(testSenderTel, models.GroupMessageSend{
		GroupID: testGroupID, Message: "hola", ClientID: "nope",
	}, context.Background())

	assert.Nil(t, resp)
	assert.ErrorIs(t, err, ErrInvalidClientID)
	repo.AssertNotCalled(t, "CreateGroupMessageIdempotent", mock.Anything, mock.Anything)
}

// A removed member replaying a queued send is rejected by the membership check
// before the idempotency lookup ever runs.
func TestGroupClientID_RemovedMemberReplayRejectedBeforeLookup(t *testing.T) {
	svc, repo, contacts := newGroupServiceForSend()
	contacts.On("GetIdByTelephon", testSenderTel, mock.Anything).Return(testSenderID, nil)
	repo.On("GetMemberRole", testGroupID, uint(testSenderID), mock.Anything).Return("", errors.New("record not found"))

	resp, err := svc.SendGroupMessage(testSenderTel, models.GroupMessageSend{
		GroupID: testGroupID, Message: "hola", ClientID: testClientID,
	}, context.Background())

	assert.Nil(t, resp)
	assert.ErrorIs(t, err, ErrNotGroupMember)
	repo.AssertNotCalled(t, "CreateGroupMessageIdempotent", mock.Anything, mock.Anything)
}

func TestGroupClientID_AbsentKeepsLegacyInsert(t *testing.T) {
	svc, repo, contacts := newGroupServiceForSend()
	expectMemberSend(repo, contacts)

	resp, err := svc.SendGroupMessage(testSenderTel, models.GroupMessageSend{
		GroupID: testGroupID, Message: "hola",
	}, context.Background())

	require.NoError(t, err)
	assert.False(t, resp.Duplicate)
	assert.Nil(t, resp.ClientID)
	repo.AssertCalled(t, "CreateGroupMessage", mock.Anything, mock.Anything)
}
