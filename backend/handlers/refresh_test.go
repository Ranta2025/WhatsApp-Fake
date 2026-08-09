package handlers

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"gorm/backend/utils"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

func cookieByName(cookies []*http.Cookie, name string) *http.Cookie {
	for _, ck := range cookies {
		if ck.Name == name {
			return ck
		}
	}
	return nil
}

// C1: el refresh rota el par de tokens — emite un refresh token NUEVO y lo
// persiste vía RotateRefreshToken (DEL old + SET new atómico).
func TestHandlerRefreshTokenRotatesPair(t *testing.T) {
	setupJWTSecret(t)

	mockService := new(MockUserService)
	handler := &HandlerUser{service: mockService}

	accessToken, err := utils.GenerateToken("testuser", "12345678")
	require.NoError(t, err)

	mockService.On("ValidateRefreshToken", "testuser", "old-refresh", mock.Anything).Return(nil)
	mockService.On("RotateRefreshToken", "old-refresh", mock.Anything, "testuser", mock.Anything).Return(nil)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/refresh", nil)
	c.Request.AddCookie(&http.Cookie{Name: "token", Value: accessToken})
	c.Request.AddCookie(&http.Cookie{Name: "refresh_token", Value: "old-refresh"})

	handler.HandlerRefreshToken()(c)

	require.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), "token renovado")

	newRefresh := cookieByName(w.Result().Cookies(), "refresh_token")
	require.NotNil(t, newRefresh, "debe emitir una cookie refresh_token nueva")
	assert.NotEqual(t, "old-refresh", newRefresh.Value, "el refresh token debe rotar (nunca reutilizar el viejo)")

	newAccess := cookieByName(w.Result().Cookies(), "token")
	require.NotNil(t, newAccess)
	assert.True(t, newAccess.HttpOnly)
	assert.True(t, newRefresh.HttpOnly)
	mockService.AssertExpectations(t)
}

// C1: si la rotación atómica falla (p.ej. el token viejo ya fue usado en otro
// refresh), la petición se rechaza con 401 y no se emiten cookies nuevas.
func TestHandlerRefreshTokenRotationConflict(t *testing.T) {
	setupJWTSecret(t)

	mockService := new(MockUserService)
	handler := &HandlerUser{service: mockService}

	accessToken, err := utils.GenerateToken("testuser", "12345678")
	require.NoError(t, err)

	mockService.On("ValidateRefreshToken", "testuser", "old-refresh", mock.Anything).Return(nil)
	mockService.On("RotateRefreshToken", "old-refresh", mock.Anything, "testuser", mock.Anything).Return(errors.New("refresh token invalido o expirado"))

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/refresh", nil)
	c.Request.AddCookie(&http.Cookie{Name: "token", Value: accessToken})
	c.Request.AddCookie(&http.Cookie{Name: "refresh_token", Value: "old-refresh"})

	handler.HandlerRefreshToken()(c)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
	assert.Contains(t, w.Body.String(), "refresh token invalido o expirado")
	assert.Empty(t, w.Result().Cookies(), "no deben emitirse cookies nuevas si la rotación falla")
	mockService.AssertExpectations(t)
}

// Sin cookie refresh_token la petición se rechaza sin tocar el servicio.
func TestHandlerRefreshTokenMissingCookie(t *testing.T) {
	setupJWTSecret(t)

	handler := &HandlerUser{service: new(MockUserService)}

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/refresh", nil)

	handler.HandlerRefreshToken()(c)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
	assert.Contains(t, w.Body.String(), "refresh token no encontrado")
}

// C2: con un access token firmado por una clave desconocida, el refresh se
// rechaza (el atacante no puede renovar usando un JWT falso).
func TestHandlerRefreshTokenRejectsForgedAccessToken(t *testing.T) {
	setupJWTSecret(t)

	handler := &HandlerUser{service: new(MockUserService)}

	forged := signToken(t, mapClaims("attacker", "00000000"), "another-secret-key-32-characters-long!!")

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/refresh", nil)
	c.Request.AddCookie(&http.Cookie{Name: "token", Value: forged})
	c.Request.AddCookie(&http.Cookie{Name: "refresh_token", Value: "whatever"})

	handler.HandlerRefreshToken()(c)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
	assert.Contains(t, w.Body.String(), "token invalido")
}

// signToken expects jwt.MapClaims; helper builds them inline.
func mapClaims(username, telephon string) map[string]interface{} {
	return map[string]interface{}{
		"username": username,
		"telephon": telephon,
	}
}
