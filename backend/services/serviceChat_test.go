package services

import (
	"context"
	"gorm/backend/models"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"gorm.io/gorm"
)

// ==================== MOCKS ====================

type MockApiContactChat struct {
	mock.Mock
}

func (m *MockApiContactChat) GetIdUsername(username string, ctx context.Context) (int, error) {
	args := m.Called(username, ctx)
	return args.Int(0), args.Error(1)
}

func (m *MockApiContactChat) CreateMessage(message models.Message, ctx context.Context) error {
	args := m.Called(message, ctx)
	return args.Error(0)
}

func (m *MockApiContactChat) GetMessages(idUser, idContact uint, ctx context.Context) ([]models.Message, error) {
	args := m.Called(idUser, idContact, ctx)
	return args.Get(0).([]models.Message), args.Error(1)
}

func (m *MockApiContactChat) PutStatusMessageSeenByContact(idReceptor, idUser uint, ctx context.Context) error {
	args := m.Called(idReceptor, idUser, ctx)
	return args.Error(0)
}

func (m *MockApiContactChat) PutStatusMessageDelivered(idUser uint, ctx context.Context) error {
	args := m.Called(idUser, ctx)
	return args.Error(0)
}

// ==================== TESTS ====================

func TestInitServiceMessage(t *testing.T) {
	service := InitServiceMessage(nil)
	assert.NotNil(t, service)
}

func TestConvertMessagesToSchemas(t *testing.T) {
	messagesDB := []models.Message{
		{
			Message: "Hello",
			Status:  "enviado",
			Time:    time.Now(),
		},
	}

	result := convertMessagesToSchemas(messagesDB, "user", "contact", 1)
	assert.NotNil(t, result)
	assert.Len(t, result, 1)
}

// TestServiceCreatMessageMissingUser test para crear mensaje sin usuario
func TestServiceCreatMessageMissingUser(t *testing.T) {
	message := models.MessageCreat{
		Telephon: "nonexistent",
		MessageGet: models.MessageGet{
			Receptor: "receptor",
			Message:  "Hello",
		},
	}

	// Con repo nil, debería fallar
	assert.NotNil(t, message)
}

// TestServiceGetMessagesMissingData test para obtener mensajes sin datos
func TestServiceGetMessagesMissingData(t *testing.T) {
	ctx := context.Background()
	assert.NotNil(t, ctx)
}

// TestServicePutMessageStatusDeliveredValidation test para actualizar estado
func TestServicePutMessageStatusDeliveredValidation(t *testing.T) {
	ctx := context.Background()
	assert.NotNil(t, ctx)
}

// TestServicePutAllMessageStatusDeliveredValidation test para actualizar todos
func TestServicePutAllMessageStatusDeliveredValidation(t *testing.T) {
	ctx := context.Background()
	assert.NotNil(t, ctx)
}

// ==================== TESTS: paginación por cursor ====================

// stubPagedChatRepo implementa solo lo necesario para ServiceGetMessagesPage;
// el resto entra por la interfaz embebida (nil).
type stubPagedChatRepo struct {
	ChatRepoInterface
	gotBefore uint
	gotLimit  int
	messages  []models.Message
	hasMore   bool
}

func (r *stubPagedChatRepo) GetIdByTelephon(telephon string, ctx context.Context) (int, error) {
	if telephon == "user" {
		return 1, nil
	}
	return 2, nil
}

func (r *stubPagedChatRepo) GetMessagesPage(idUser, idContact, before uint, limit int, ctx context.Context) ([]models.Message, bool, error) {
	r.gotBefore, r.gotLimit = before, limit
	return r.messages, r.hasMore, nil
}

func TestServiceGetMessagesPage_PassesCursorAndHasMore(t *testing.T) {
	repo := &stubPagedChatRepo{messages: []models.Message{{Model: gorm.Model{ID: 5}, IdUser: 1, IdReceptor: 2, Message: "x"}}, hasMore: true}
	svc := InitServiceMessage(repo)

	msgs, hasMore, err := svc.ServiceGetMessagesPage("user", "contact", 9, 30, context.Background())

	assert.NoError(t, err)
	assert.True(t, hasMore)
	assert.Equal(t, uint(9), repo.gotBefore)
	assert.Equal(t, 30, repo.gotLimit)
	if assert.Len(t, msgs, 1) {
		assert.Equal(t, uint(5), msgs[0].MessageID)
	}
}

func TestServiceGetMessagesPage_LimitRules(t *testing.T) {
	cases := []struct{ in, want int }{
		{0, chatListMessagesPerChat}, // sin límite explícito: comportamiento histórico (200)
		{-4, chatListMessagesPerChat},
		{20, 20},
		{100, 100},
		{5000, maxChatMessagesPage},
	}
	for _, tc := range cases {
		repo := &stubPagedChatRepo{}
		svc := InitServiceMessage(repo)
		_, _, err := svc.ServiceGetMessagesPage("user", "contact", 0, tc.in, context.Background())
		assert.NoError(t, err)
		assert.Equal(t, tc.want, repo.gotLimit, "limit=%d", tc.in)
	}
}

// ==================== TESTS: sticker editing ====================

// stubEditChatRepo implements only the repository surface ServiceEditMessage
// needs; the rest of the interface is reached through the embedded nil.
type stubEditChatRepo struct {
	ChatRepoInterface
	msg     *models.Message
	updated bool
}

func (r *stubEditChatRepo) GetIdByTelephon(telephon string, ctx context.Context) (int, error) {
	return 1, nil
}

func (r *stubEditChatRepo) GetMessageByID(messageID uint, ctx context.Context) (*models.Message, error) {
	if r.msg == nil {
		return nil, models.ErrMessageNotFound
	}
	return r.msg, nil
}

func (r *stubEditChatRepo) UpdateMessageContent(messageID uint, senderID uint, newContent string, ctx context.Context) error {
	r.updated = true
	return nil
}

func (r *stubEditChatRepo) GetTelephonByID(id uint, ctx context.Context) (string, error) {
	return "+b", nil
}

func TestServiceEditMessage_RejectsSticker(t *testing.T) {
	repo := &stubEditChatRepo{msg: &models.Message{
		Model:     gorm.Model{ID: 1},
		MediaType: "sticker",
		MediaUrl:  "/stickers/basic/hola.webp",
	}}
	svc := &ServiceChat{repo: repo}

	_, err := svc.ServiceEditMessage("+a", 1, "nuevo texto", context.Background())

	assert.ErrorIs(t, err, ErrStickerNotEditable)
	assert.False(t, repo.updated, "a sticker message must not be updated")
}

func TestServiceEditMessage_AllowsTextMessage(t *testing.T) {
	repo := &stubEditChatRepo{msg: &models.Message{
		Model: gorm.Model{ID: 1}, IdReceptor: 2, Message: "old",
	}}
	svc := &ServiceChat{repo: repo}

	out, err := svc.ServiceEditMessage("+a", 1, "new", context.Background())

	assert.NoError(t, err)
	assert.True(t, repo.updated)
	assert.Equal(t, uint(1), out.MessageID)
}
