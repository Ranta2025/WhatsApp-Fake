package services

import (
	"context"
	"errors"
	"gorm/backend/models"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"gorm.io/gorm"
)

// ==================== MOCKS ====================

// MockGroupRepo implementa GroupRepoInterface; solo IsMember y CreateGroupMessage
// se usan en el envío de mensajes, el resto queda sin expectativas.
type MockGroupRepo struct {
	mock.Mock
}

func (m *MockGroupRepo) CreateGroupWithMembers(group *models.Group, creatorID uint, memberIDs []uint, ctx context.Context) error {
	return m.Called(group, creatorID, memberIDs, ctx).Error(0)
}

func (m *MockGroupRepo) AddMembers(groupID uint, members []models.GroupMember, system *models.GroupMessage, ctx context.Context) ([]models.GroupMember, error) {
	args := m.Called(groupID, members, system, ctx)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]models.GroupMember), args.Error(1)
}

func (m *MockGroupRepo) ChangeMemberRole(groupID, actorID, targetID uint, newRole string, system *models.GroupMessage, ctx context.Context) error {
	return m.Called(groupID, actorID, targetID, newRole, system, ctx).Error(0)
}

func (m *MockGroupRepo) RemoveMember(groupID, actorID, targetID uint, system *models.GroupMessage, ctx context.Context) error {
	return m.Called(groupID, actorID, targetID, system, ctx).Error(0)
}

func (m *MockGroupRepo) UpdateGroupSettings(groupID, actorID uint, patch models.GroupSettingsUpdate, system *models.GroupMessage, ctx context.Context) (*models.Group, error) {
	args := m.Called(groupID, actorID, patch, system, ctx)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.Group), args.Error(1)
}

func (m *MockGroupRepo) UpdateGroupInfo(groupID, actorID uint, name, description *string, system *models.GroupMessage, ctx context.Context) (*models.Group, error) {
	args := m.Called(groupID, actorID, name, description, system, ctx)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.Group), args.Error(1)
}

func (m *MockGroupRepo) SetGroupDisappearing(actorID, groupID uint, seconds int, sysMsg *models.GroupMessage, ctx context.Context) (bool, *models.GroupMessage, error) {
	args := m.Called(actorID, groupID, seconds, sysMsg, ctx)
	// Como el repo real: cuando hubo cambio devuelve el mismo mensaje mutado.
	if !args.Bool(0) {
		return false, nil, args.Error(2)
	}
	return true, sysMsg, args.Error(2)
}

func (m *MockGroupRepo) GetGroupDisappearing(groupID uint, ctx context.Context) (int, error) {
	args := m.Called(groupID, ctx)
	return args.Int(0), args.Error(1)
}

func (m *MockGroupRepo) GetGroupByID(groupID uint, ctx context.Context) (*models.Group, error) {
	args := m.Called(groupID, ctx)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.Group), args.Error(1)
}

func (m *MockGroupRepo) GetGroupMembers(groupID uint, ctx context.Context) ([]models.GroupMember, error) {
	args := m.Called(groupID, ctx)
	return args.Get(0).([]models.GroupMember), args.Error(1)
}

func (m *MockGroupRepo) GetUserGroups(userID uint, ctx context.Context) ([]models.UserGroupRow, error) {
	args := m.Called(userID, ctx)
	return args.Get(0).([]models.UserGroupRow), args.Error(1)
}

func (m *MockGroupRepo) IsMember(groupID, userID uint, ctx context.Context) (bool, error) {
	args := m.Called(groupID, userID, ctx)
	return args.Bool(0), args.Error(1)
}

func (m *MockGroupRepo) GetMemberRole(groupID, userID uint, ctx context.Context) (string, error) {
	args := m.Called(groupID, userID, ctx)
	return args.String(0), args.Error(1)
}

func (m *MockGroupRepo) GetMemberTelephons(groupID uint, ctx context.Context) ([]string, error) {
	args := m.Called(groupID, ctx)
	return args.Get(0).([]string), args.Error(1)
}

func (m *MockGroupRepo) CreateGroupMessage(msg *models.GroupMessage, ctx context.Context) error {
	return m.Called(msg, ctx).Error(0)
}

func (m *MockGroupRepo) GetGroupMessages(groupID uint, limit, offset int, ctx context.Context) ([]models.GroupMessage, error) {
	args := m.Called(groupID, limit, offset, ctx)
	return args.Get(0).([]models.GroupMessage), args.Error(1)
}

func (m *MockGroupRepo) GetGroupMessagesPage(groupID, before uint, limit, offset int, ctx context.Context) ([]models.GroupMessage, bool, error) {
	args := m.Called(groupID, before, limit, offset, ctx)
	return args.Get(0).([]models.GroupMessage), args.Bool(1), args.Error(2)
}

func (m *MockGroupRepo) GetGroupMessageByID(messageID uint, ctx context.Context) (*models.GroupMessage, error) {
	args := m.Called(messageID, ctx)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.GroupMessage), args.Error(1)
}

func (m *MockGroupRepo) EditGroupMessage(groupID, messageID, senderID uint, newContent string, ctx context.Context) error {
	return m.Called(groupID, messageID, senderID, newContent, ctx).Error(0)
}

func (m *MockGroupRepo) DeleteGroupMessage(groupID, messageID, senderID uint, ctx context.Context) error {
	return m.Called(groupID, messageID, senderID, ctx).Error(0)
}

func (m *MockGroupRepo) LeaveGroup(groupID, userID uint, system *models.GroupMessage, ctx context.Context) error {
	return m.Called(groupID, userID, system, ctx).Error(0)
}

func (m *MockGroupRepo) UpdateGroupAvatar(groupID uint, avatarUrl string, ctx context.Context) error {
	return m.Called(groupID, avatarUrl, ctx).Error(0)
}

func (m *MockGroupRepo) AdvanceMemberReceipts(groupID, userID, deliveredUpTo, readUpTo uint, ctx context.Context) (models.GroupReceiptState, bool, error) {
	args := m.Called(groupID, userID, deliveredUpTo, readUpTo, ctx)
	return args.Get(0).(models.GroupReceiptState), args.Bool(1), args.Error(2)
}

func (m *MockGroupRepo) SearchGroupMessages(groupID, userID uint, q string, before uint, limit int, ctx context.Context) ([]models.SearchRow, bool, error) {
	args := m.Called(groupID, userID, q, before, limit, ctx)
	return args.Get(0).([]models.SearchRow), args.Bool(1), args.Error(2)
}

func (m *MockGroupRepo) GetGroupMessagesAround(groupID, around uint, limit int, ctx context.Context) ([]models.GroupMessage, bool, bool, error) {
	args := m.Called(groupID, around, limit, ctx)
	return args.Get(0).([]models.GroupMessage), args.Bool(1), args.Bool(2), args.Error(3)
}

func (m *MockGroupRepo) GetGroupMessagesAfter(groupID, after uint, limit int, ctx context.Context) ([]models.GroupMessage, bool, error) {
	args := m.Called(groupID, after, limit, ctx)
	return args.Get(0).([]models.GroupMessage), args.Bool(1), args.Error(2)
}

// MockGroupContactRepo implementa GroupContactRepoInterface.
type MockGroupContactRepo struct {
	mock.Mock
}

func (m *MockGroupContactRepo) GetIdByTelephon(telephon string, ctx context.Context) (int, error) {
	args := m.Called(telephon, ctx)
	return args.Int(0), args.Error(1)
}

func (m *MockGroupContactRepo) GetTelephonByID(id uint, ctx context.Context) (string, error) {
	args := m.Called(id, ctx)
	return args.String(0), args.Error(1)
}

func (m *MockGroupContactRepo) IsAcceptedContact(userID, contactID uint, ctx context.Context) (bool, error) {
	args := m.Called(userID, contactID, ctx)
	return args.Bool(0), args.Error(1)
}

func (m *MockGroupContactRepo) GetUsernameByTelephon(telephon string, ctx context.Context) (string, error) {
	args := m.Called(telephon, ctx)
	return args.String(0), args.Error(1)
}

// ==================== TESTS: media en mensajes de grupo ====================

const (
	testGroupID   uint = 7
	testSenderID       = 42
	testSenderTel      = "+34600000001"
)

func newGroupServiceForSend() (GroupServicer, *MockGroupRepo, *MockGroupContactRepo) {
	repo := &MockGroupRepo{}
	contacts := &MockGroupContactRepo{}
	return InitServiceGroup(repo, contacts), repo, contacts
}

func expectMemberSend(repo *MockGroupRepo, contacts *MockGroupContactRepo) {
	contacts.On("GetIdByTelephon", testSenderTel, mock.Anything).Return(testSenderID, nil)
	contacts.On("GetUsernameByTelephon", testSenderTel, mock.Anything).Return("alice", nil)
	// El envío pasa por la matriz de permisos: rol del actor + settings del grupo.
	repo.On("GetMemberRole", testGroupID, uint(testSenderID), mock.Anything).Return(models.GroupRoleMember, nil)
	repo.On("GetGroupByID", testGroupID, mock.Anything).Return(&models.Group{}, nil)
	repo.On("CreateGroupMessage", mock.Anything, mock.Anything).Return(nil)
}

func TestSendGroupMessage_MediaAccepted(t *testing.T) {
	cases := []struct {
		name      string
		mediaType string
		mediaUrl  string
		message   string
	}{
		{"imagen sin texto", "image", "/storage/pic.png", ""},
		{"audio (nota de voz)", "audio", "/storage/voice.webm", ""},
		{"video con texto", "video", "/storage/clip.mp4", "mira"},
		{"documento con URL absoluta", "document", "https://example.com/doc.pdf", "doc.pdf"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			svc, repo, contacts := newGroupServiceForSend()
			expectMemberSend(repo, contacts)

			resp, err := svc.SendGroupMessage(testSenderTel, models.GroupMessageSend{
				GroupID:   testGroupID,
				Message:   tc.message,
				MediaUrl:  tc.mediaUrl,
				MediaType: tc.mediaType,
			}, context.Background())

			assert.NoError(t, err)
			if assert.NotNil(t, resp) {
				assert.Equal(t, tc.mediaUrl, resp.MediaUrl)
				assert.Equal(t, tc.mediaType, resp.MediaType)
				assert.Equal(t, tc.message, resp.Message)
			}
			repo.AssertCalled(t, "CreateGroupMessage", mock.MatchedBy(func(m *models.GroupMessage) bool {
				return m.MediaUrl == tc.mediaUrl && m.MediaType == tc.mediaType && m.GroupID == testGroupID
			}), mock.Anything)
		})
	}
}

func TestSendGroupMessage_MediaRejected(t *testing.T) {
	cases := []struct {
		name      string
		mediaType string
		mediaUrl  string
		wantErr   string
	}{
		{"URL javascript:", "document", "javascript:alert(1)", "URL del archivo adjunto no válida"},
		{"URL data:", "image", "data:text/html;base64,PGh0bWw+", "URL del archivo adjunto no válida"},
		{"path traversal en storage", "image", "/storage/../etc/passwd", "URL del archivo adjunto no válida"},
		{"URL demasiado larga", "image", "/storage/" + strings.Repeat("a", 600), "URL del archivo adjunto no válida"},
		{"tipo inválido", "exe", "/storage/a.bin", "tipo de archivo no válido"},
		{"tipo sin URL", "image", "", "falta la URL del archivo adjunto"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			svc, repo, _ := newGroupServiceForSend()

			resp, err := svc.SendGroupMessage(testSenderTel, models.GroupMessageSend{
				GroupID:   testGroupID,
				Message:   "x",
				MediaUrl:  tc.mediaUrl,
				MediaType: tc.mediaType,
			}, context.Background())

			assert.Nil(t, resp)
			assert.EqualError(t, err, tc.wantErr)
			repo.AssertNotCalled(t, "CreateGroupMessage", mock.Anything, mock.Anything)
		})
	}
}

func TestSendGroupMessage_EmptyWithoutMediaRejected(t *testing.T) {
	svc, repo, _ := newGroupServiceForSend()

	resp, err := svc.SendGroupMessage(testSenderTel, models.GroupMessageSend{GroupID: testGroupID, Message: "   "}, context.Background())

	assert.Nil(t, resp)
	assert.EqualError(t, err, "el mensaje no puede estar vacío")
	repo.AssertNotCalled(t, "CreateGroupMessage", mock.Anything, mock.Anything)
}

func TestSendGroupMessage_MediaFromNonMemberRejected(t *testing.T) {
	svc, repo, contacts := newGroupServiceForSend()
	contacts.On("GetIdByTelephon", testSenderTel, mock.Anything).Return(testSenderID, nil)
	repo.On("GetMemberRole", testGroupID, uint(testSenderID), mock.Anything).Return("", errors.New("no miembro"))

	resp, err := svc.SendGroupMessage(testSenderTel, models.GroupMessageSend{
		GroupID: testGroupID, MediaUrl: "/storage/pic.png", MediaType: "image",
	}, context.Background())

	assert.Nil(t, resp)
	assert.EqualError(t, err, "no eres miembro de este grupo")
	repo.AssertNotCalled(t, "CreateGroupMessage", mock.Anything, mock.Anything)
}

func TestSendGroupMessage_SaveErrorIsReported(t *testing.T) {
	svc, repo, contacts := newGroupServiceForSend()
	contacts.On("GetIdByTelephon", testSenderTel, mock.Anything).Return(testSenderID, nil)
	repo.On("GetMemberRole", testGroupID, uint(testSenderID), mock.Anything).Return(models.GroupRoleMember, nil)
	repo.On("GetGroupByID", testGroupID, mock.Anything).Return(&models.Group{}, nil)
	repo.On("CreateGroupMessage", mock.Anything, mock.Anything).Return(errors.New("db"))

	resp, err := svc.SendGroupMessage(testSenderTel, models.GroupMessageSend{
		GroupID: testGroupID, MediaUrl: "/storage/pic.png", MediaType: "image",
	}, context.Background())

	assert.Nil(t, resp)
	assert.EqualError(t, err, "error al guardar el mensaje")
}

// ==================== TESTS: paginación por cursor ====================

func TestGetGroupMessagesPage_PassesCursorAndHasMore(t *testing.T) {
	svc, repo, contacts := newGroupServiceForSend()
	contacts.On("GetIdByTelephon", testSenderTel, mock.Anything).Return(testSenderID, nil)
	repo.On("IsMember", testGroupID, uint(testSenderID), mock.Anything).Return(true, nil)
	repo.On("GetGroupMessagesPage", testGroupID, uint(90), 30, 0, mock.Anything).
		Return([]models.GroupMessage{{Model: gorm.Model{ID: 89}, Message: "a"}}, true, nil)

	msgs, hasMore, err := svc.GetGroupMessagesPage(testSenderTel, testGroupID, 90, 30, 0, context.Background())

	assert.NoError(t, err)
	assert.True(t, hasMore)
	if assert.Len(t, msgs, 1) {
		assert.Equal(t, uint(89), msgs[0].MessageID)
	}
}

func TestGetGroupMessagesPage_ClampsLimit(t *testing.T) {
	svc, repo, contacts := newGroupServiceForSend()
	contacts.On("GetIdByTelephon", testSenderTel, mock.Anything).Return(testSenderID, nil)
	repo.On("IsMember", testGroupID, uint(testSenderID), mock.Anything).Return(true, nil)
	repo.On("GetGroupMessagesPage", testGroupID, uint(0), maxGroupMessagesPage, 0, mock.Anything).
		Return([]models.GroupMessage{}, false, nil)

	_, hasMore, err := svc.GetGroupMessagesPage(testSenderTel, testGroupID, 0, 5000, -3, context.Background())

	assert.NoError(t, err)
	assert.False(t, hasMore)
	repo.AssertExpectations(t)
}

func TestGetGroupMessagesPage_NonMemberRejected(t *testing.T) {
	svc, repo, contacts := newGroupServiceForSend()
	contacts.On("GetIdByTelephon", testSenderTel, mock.Anything).Return(testSenderID, nil)
	repo.On("IsMember", testGroupID, uint(testSenderID), mock.Anything).Return(false, nil)

	msgs, hasMore, err := svc.GetGroupMessagesPage(testSenderTel, testGroupID, 10, 10, 0, context.Background())

	assert.Nil(t, msgs)
	assert.False(t, hasMore)
	assert.EqualError(t, err, "no tienes acceso a este grupo")
	repo.AssertNotCalled(t, "GetGroupMessagesPage", mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything)
}
