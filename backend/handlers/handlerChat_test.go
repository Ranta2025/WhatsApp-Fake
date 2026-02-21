package handlers

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

// TestInitHandlerChat test para inicializar handler de chat
func TestInitHandlerChat(t *testing.T) {
	handler := InitHandlerChat(nil)
	assert.NotNil(t, handler)
}

// TestHandlerPostChatMissingData test para crear mensaje sin datos
func TestHandlerPostChatMissingData(t *testing.T) {
	handler := &HandlerChat{service: nil}

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/chat/message", nil)

	handler.HandlerPostChat()(c)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

// TestHandlerGetChatsMissingData test para obtener mensajes sin datos
func TestHandlerGetChatsMissingData(t *testing.T) {
	handler := &HandlerChat{service: nil}

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/chat/messages", nil)

	handler.HandlerGetChats()(c)

	assert.Equal(t, http.StatusBadRequest, w.Code)
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
