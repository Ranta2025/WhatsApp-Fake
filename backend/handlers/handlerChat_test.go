package handlers

import (
	"gorm/backend/models"
	"gorm/backend/schemas"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
)

// TestInitHandlerChat test para inicializar handler de chat
func TestInitHandlerChat(t *testing.T) {
	handler := InitHandlerChat(nil, nil)
	assert.NotNil(t, handler)
}

func TestHandlerPostChatSuccess(t *testing.T) {
	mockService := new(MockChatService)
	handler := &HandlerChat{service: mockService}

	telephon := "12345678"
	msgGet := models.MessageGet{Receptor: "87654321", Message: "Hola"}
	msgExtract := models.MessageCreat{MessageGet: msgGet, Telephon: telephon}
	msgSchema := schemas.Message{MessageID: 1, Message: "Hola"}

	mockService.On("ServiceCreatMessage", msgExtract, mock.Anything).Return(msgSchema, nil)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/chat", nil)
	c.Set("telephon", telephon)
	c.Set("message", msgGet)

	handler.HandlerPostChat()(c)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), "Hola")
	mockService.AssertExpectations(t)
}

func TestHandlerGetChatsSuccess(t *testing.T) {
	mockService := new(MockChatService)
	handler := &HandlerChat{service: mockService}

	telephon := "12345678"
	contact := "87654321"
	messages := []schemas.Message{{MessageID: 1, Message: "Hola"}}

	mockService.On("ServiceGetMessages", telephon, contact, mock.Anything).Return(messages, nil)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/chat", nil)
	c.Set("telephon", telephon)
	c.Set("contact", contact)

	handler.HandlerGetChats()(c)

	assert.Equal(t, http.StatusOK, w.Code)
	mockService.AssertExpectations(t)
}

// TestHandlerPutChatMissingData test para actualizar estado sin datos
func TestHandlerPutChatMissingData(t *testing.T) {
	handler := &HandlerChat{service: nil}

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("PUT", "/chat/status", nil)

	handler.HandlerPutChat()(c)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

// TestHandlerPutAllChatMissingData test para actualizar todos sin datos
func TestHandlerPutAllChatMissingData(t *testing.T) {
	handler := &HandlerChat{service: nil}

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("PUT", "/chat/status-all", nil)

	handler.HandlerPutAllChat()(c)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}
