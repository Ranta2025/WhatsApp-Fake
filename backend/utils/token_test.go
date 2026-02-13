package utils

import (
	"errors"
	"os"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestGenerateTokenSuccess prueba que se genera un token válido con username correcto
func TestGenerateTokenSuccess(t *testing.T) {
	// ARRANGE
	username := "usuarioTest"

	// ACT
	token, err := GenerateToken(username)

	// ASSERT
	require.NoError(t, err)           // ✅ No debe haber error
	assert.NotEmpty(t, token)         // ✅ Token no vacío
	assert.Greater(t, len(token), 50) // ✅ JWT es largo (típicamente 100+ chars)
	assert.Contains(t, token, ".")    // ✅ JWT tiene formato: header.payload.signature
}

// TestGenerateTokenUsernameEmpty prueba que un username vacío genera token (aunque no sea ideal)
func TestGenerateTokenUsernameEmpty(t *testing.T) {
	// ARRANGE
	username := ""

	// ACT
	token, err := GenerateToken(username)

	// ASSERT
	// Nota: bcrypt acepta username vacío, pero sería mejor validar en el handler
	require.NoError(t, err)          // ✅ No debe haber error
	assert.NotEmpty(t, token)        // ✅ Token se genera igual
	assert.Greater(t, len(token), 0) // ✅ Token tiene contenido
}

// TestDecodeTokenSuccess prueba que se decodifica correctamente un token válido
func TestDecodeTokenSuccess(t *testing.T) {
	// ARRANGE
	username := "usuarioTest"
	token, err := GenerateToken(username)
	require.NoError(t, err) // ✅ Aseguramos que el token se genere sin error

	// ACT
	decodedUsername, err := DecodeToken(token)

	// ASSERT
	require.NoError(t, err)                    // ✅ No debe haber error
	assert.Equal(t, username, decodedUsername) // ✅ Username decodificado coincide
}

// TestDecodeTokenInvalid prueba que un token malformado causa error
func TestDecodeTokenInvalid(t *testing.T) {
	// ARRANGE
	invalidToken := "tokenInvalido123"

	// ACT
	decodedUsername, err := DecodeToken(invalidToken)

	// ASSERT
	require.Error(t, err)            // ✅ Debe haber un error
	assert.Empty(t, decodedUsername) // ✅ No devuelve username si hay error
}

// TestDecodeTokenExpired prueba que un token expirado causa error
func TestDecodeTokenExpired(t *testing.T) {
	// ARRANGE
	username := "usuarioTest"
	// Generar un token que expiró hace 1 segundo
	token, err := GenerateTokenWithExpiry(username, -1)
	require.NoError(t, err) // ✅ El token debe generarse sin error

	// ACT
	decodedUsername, err := DecodeToken(token)

	// ASSERT
	require.Error(t, err)            // ✅ Debe haber error por expiración
	assert.Empty(t, decodedUsername) // ✅ No devuelve username si token está expirado
}

// TestGenerateTokenWithSpecialCharacters prueba que caracteres especiales se preservan
func TestGenerateTokenWithSpecialCharacters(t *testing.T) {
	// ARRANGE
	username := "user@example.com"

	// ACT
	token, err := GenerateToken(username)
	require.NoError(t, err)

	decodedUsername, err := DecodeToken(token)

	// ASSERT
	require.NoError(t, err)
	assert.Equal(t, username, decodedUsername) // ✅ Caracteres especiales se preservan
}

// TestGenerateAndDecodeTokenFlow prueba el flujo completo: generar y decodificar
func TestGenerateAndDecodeTokenFlow(t *testing.T) {
	// ARRANGE
	usernames := []string{"admin", "user123", "test.user", "admin@company"}

	// ACT & ASSERT
	for _, username := range usernames {
		t.Run(username, func(t *testing.T) {
			// Generar
			token, err := GenerateToken(username)
			require.NoError(t, err)

			// Decodificar
			decoded, err := DecodeToken(token)

			// Verificar
			require.NoError(t, err)
			assert.Equal(t, username, decoded)
		})
	}
}

// GenerateTokenWithExpiry es una función auxiliar para crear tokens con expiración custom
func GenerateTokenWithExpiry(username string, expirySeconds int64) (string, error) {
	claim := jwt.MapClaims{}
	claim["username"] = username
	claim["exp"] = time.Now().Add(time.Duration(expirySeconds) * time.Second).Unix()
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claim)
	hash_token, err := token.SignedString([]byte(os.Getenv("SECRETKEY")))
	if err != nil {
		return "", errors.New("Error al crear token")
	}
	return hash_token, nil
}
