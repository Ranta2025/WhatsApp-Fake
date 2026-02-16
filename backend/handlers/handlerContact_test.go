package handlers

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

// TestInitHandlerContact test para inicializar handler de contactos
func TestInitHandlerContact(t *testing.T) {
	handler := InitHandlerApiMessage(nil, nil)
	assert.NotNil(t, handler)
}

// TestHandlerGetUserMissing test para obtener usuario sin datos
func TestHandlerGetUserMissing(t *testing.T) {
	handler := &HandlerContact{service: nil, hub: nil}

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/contact/user", nil)

	handler.HandlerGetUser()(c)

	assert.Equal(t, http.StatusBadGateway, w.Code)
}

// TestHandlerPutUserMissing test para actualizar usuario sin datos
func TestHandlerPutUserMissing(t *testing.T) {
	handler := &HandlerContact{service: nil}

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("PUT", "/contact/user", nil)

	handler.HandlerPutUser()(c)

	assert.Equal(t, http.StatusBadGateway, w.Code)
}

// TestHandlerAddContactMissing test para agregar contacto sin datos
func TestHandlerAddContactMissing(t *testing.T) {
	handler := &HandlerContact{service: nil}

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/contact/add", nil)

	handler.HandlerAddContact()(c)

	assert.Equal(t, http.StatusBadGateway, w.Code)
}

// TestHandlerContactsMissing test para obtener contactos sin datos
func TestHandlerContactsMissing(t *testing.T) {
	handler := &HandlerContact{service: nil}

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/contact/list", nil)

	handler.HandlerContacts()(c)

	assert.Equal(t, http.StatusBadGateway, w.Code)
}

// TestContactPutMissing test para actualizar estado de contacto sin datos
func TestContactPutMissing(t *testing.T) {
	handler := &HandlerContact{service: nil}

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("PUT", "/contact/status", nil)

	handler.ContactPut()(c)

	assert.Equal(t, http.StatusBadGateway, w.Code)
}
