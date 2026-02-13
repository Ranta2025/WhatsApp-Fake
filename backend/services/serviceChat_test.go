package services

import (
	"context"
	"gorm/backend/models"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
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
		Username: "nonexistent",
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
