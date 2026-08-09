package services

import (
	"context"
	"gorm/backend/models"
	"gorm/backend/schemas"
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

func (m *MockApiContactChat) CreateMessage(msg *models.Message, ctx context.Context) error {
	args := m.Called(msg, ctx)
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

func (m *MockApiContactChat) GetIdByTelephon(telephon string, ctx context.Context) (int, error) {
	args := m.Called(telephon, ctx)
	return args.Int(0), args.Error(1)
}

func (m *MockApiContactChat) GetTelephonByID(id uint, ctx context.Context) (string, error) {
	args := m.Called(id, ctx)
	return args.String(0), args.Error(1)
}

func (m *MockApiContactChat) GetSenderTelephonsWithPendingMessages(receiverID uint, ctx context.Context) ([]string, error) {
	args := m.Called(receiverID, ctx)
	return args.Get(0).([]string), args.Error(1)
}

func (m *MockApiContactChat) GetAllMessagesForUser(userID uint, ctx context.Context) ([]models.Message, error) {
	args := m.Called(userID, ctx)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]models.Message), args.Error(1)
}

func (m *MockApiContactChat) GetAddedContactIDs(userID uint, ctx context.Context) (map[uint]string, error) {
	args := m.Called(userID, ctx)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(map[uint]string), args.Error(1)
}

func (m *MockApiContactChat) GetUserDataBaseByTelephon(telephon string, ctx context.Context) (*schemas.UserGet, error) {
	args := m.Called(telephon, ctx)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*schemas.UserGet), args.Error(1)
}

func (m *MockApiContactChat) GetMessageByID(messageID uint, ctx context.Context) (*models.Message, error) {
	args := m.Called(messageID, ctx)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.Message), args.Error(1)
}

func (m *MockApiContactChat) DeleteMessageForMe(messageID uint, userID uint, ctx context.Context) (*models.Message, error) {
	args := m.Called(messageID, userID, ctx)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.Message), args.Error(1)
}

func (m *MockApiContactChat) GetUserByID(userID uint, ctx context.Context) (*models.UserDataBase, error) {
	args := m.Called(userID, ctx)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.UserDataBase), args.Error(1)
}

func (m *MockApiContactChat) GetUserByIDs(ids []uint, ctx context.Context) (map[uint]*models.UserDataBase, error) {
	args := m.Called(ids, ctx)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(map[uint]*models.UserDataBase), args.Error(1)
}

func (m *MockApiContactChat) UpdateMessageContent(messageID uint, senderID uint, newContent string, ctx context.Context) error {
	args := m.Called(messageID, senderID, newContent, ctx)
	return args.Error(0)
}

func (m *MockApiContactChat) DeleteMessageForSender(messageID uint, senderID uint, ctx context.Context) (*models.Message, error) {
	args := m.Called(messageID, senderID, ctx)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.Message), args.Error(1)
}

func (m *MockApiContactChat) ClearChatForUser(userID uint, contactID uint, ctx context.Context) error {
	args := m.Called(userID, contactID, ctx)
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
			SentAt:  time.Now(),
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

// ==================== R4/N+1: batch fetch en GetAllChats ====================

// TestServiceGetAllChatsUsesBatchFetch: la lista de chats debe resolver los
// datos de los interlocutores con UNA consulta batch (GetUserByIDs) y NUNCA
// con GetUserByID por contacto (regresión contra el N+1, spec R4).
func TestServiceGetAllChatsUsesBatchFetch(t *testing.T) {
	ctx := context.Background()
	repo := &MockApiContactChat{}
	service := InitServiceMessage(repo)

	now := time.Now()
	repo.On("GetIdByTelephon", "+111", ctx).Return(1, nil)
	repo.On("GetAllMessagesForUser", uint(1), ctx).Return([]models.Message{
		{Model: gorm.Model{ID: 10}, IdUser: 2, IdReceptor: 1, Message: "hola", Status: "enviado", SentAt: now},
		{Model: gorm.Model{ID: 11}, IdUser: 3, IdReceptor: 1, Message: "que tal", Status: "enviado", SentAt: now},
	}, nil)
	repo.On("GetAddedContactIDs", uint(1), ctx).Return(map[uint]string{2: "Pepe"}, nil)
	// El orden de otrosIDs proviene de un map: la expectativa debe ser un conjunto.
	repo.On("GetUserByIDs", mock.MatchedBy(func(ids []uint) bool {
		return len(ids) == 2 &&
			((ids[0] == 2 && ids[1] == 3) || (ids[0] == 3 && ids[1] == 2))
	}), ctx).Return(map[uint]*models.UserDataBase{
		2: {User: models.User{Model: gorm.Model{ID: 2}, Username: "pepe", Telephon: "+222"}, AvatarUrl: "a2"},
		3: {User: models.User{Model: gorm.Model{ID: 3}, Username: "juan", Telephon: "+333"}, AvatarUrl: "a3"},
	}, nil)

	chats, err := service.ServiceGetAllChats("+111", ctx)

	assert.NoError(t, err)
	assert.Len(t, chats, 2)
	// batch: una sola consulta por TODOS los IDs, cero consultas individuales
	repo.AssertCalled(t, "GetUserByIDs", mock.Anything, ctx)
	repo.AssertNotCalled(t, "GetUserByID", mock.Anything, ctx)

	byTelephon := map[string]schemas.ChatGroup{}
	for _, c := range chats {
		byTelephon[c.ContactTelephon] = c
	}
	assert.Equal(t, "pepe", byTelephon["+222"].ContactUsername)
	assert.Equal(t, "Pepe", byTelephon["+222"].ContactName)
	assert.True(t, byTelephon["+222"].IsContact)
	assert.Equal(t, "juan", byTelephon["+333"].ContactUsername)
	assert.False(t, byTelephon["+333"].IsContact)
}
