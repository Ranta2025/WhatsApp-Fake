package handlers

import (
	"gorm/backend/models"
	"gorm/backend/utils"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

// TestGetHandlerUser test para la inicialización

// TestHandlerLogoutSession test para logout
func TestHandlerLogoutSessionHandler(t *testing.T) {
	mockService := new(MockUserService)
	handler := &HandlerUser{service: mockService}

	mockService.On("DeleteRefreshToken", "testuser", mock.Anything).Return(nil)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/logout", nil)
	c.Set("username", "testuser")
	c.Set("telephon", "12345678")

	handler.HandlerLogoutSession()(c)

	assert.Equal(t, http.StatusOK, w.Code)
	mockService.AssertExpectations(t)
}

func TestHandlerLogInSuccess(t *testing.T) {
	// Configurar clave secreta para el test
	os.Setenv("SECRETKEY", "super-secret-key-32-characters-long")
	utils.ValidateJWTSecret()

	mockService := new(MockUserService)
	handler := &HandlerUser{service: mockService}

	userLogin := models.UserLogin{Username: "testuser", Password: "password123"}

	// Generar un token real para que DecodeToken funcione
	token, _ := utils.GenerateToken("testuser", "12345678")

	mockService.On("LogIn", userLogin, mock.Anything).Return(token, nil)
	mockService.On("SaveRefreshToken", "testuser", mock.Anything, mock.Anything).Return(nil)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/login", nil)
	c.Set("username", "testuser")
	c.Set("password", "password123")

	handler.HandlerLogIn()(c)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), "LogIn exitoso")
	mockService.AssertExpectations(t)
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
