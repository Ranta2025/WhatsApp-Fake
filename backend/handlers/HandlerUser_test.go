package handlers

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestGetHandlerUser test para la inicialización


// TestHandlerLogoutSession test para logout
func TestHandlerLogoutSessionHandler(t *testing.T) {
	handler := &HandlerUser{service: nil}

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)

	handler.HandlerLogoutSession()(c)

	assert.Equal(t, http.StatusOK, w.Code)
}

// TestHandlerLogInMissingCredentials test para login sin credenciales
func TestHandlerLogInMissingCredentials(t *testing.T) {
	handler := &HandlerUser{service: nil}

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/login", nil)

	handler.HandlerLogIn()(c)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

// TestHandlerLogOutMissingUser test para logout sin usuario
func TestHandlerLogOutMissingUser(t *testing.T) {
	handler := &HandlerUser{service: nil}

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/register", nil)

	handler.HandlerLogOut()(c)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

// TestHandlerActivateAccountMissing test para activar cuenta sin datos
func TestHandlerActivateAccountMissing(t *testing.T) {
	handler := &HandlerUser{service: nil}

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/activate", nil)

	handler.HandlerActivateAccount()(c)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	require.NotNil(t, handler)
}
