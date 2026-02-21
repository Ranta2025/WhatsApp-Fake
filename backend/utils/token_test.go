package utils

import (
	"errors"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestGenerateTokenSuccess prueba que se genera un token válido con username y telephon correctos
func TestGenerateTokenSuccess(t *testing.T) {
	// ARRANGE
	username := "usuarioTest"
	telephon := "12345678"

	// ACT
	token, err := GenerateToken(username, telephon)

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
	telephon := "12345678"

	// ACT
	token, err := GenerateToken(username, telephon)

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
	telephon := "12345678"
	token, err := GenerateToken(username, telephon)
	require.NoError(t, err) // ✅ Aseguramos que el token se genere sin error

	// ACT
	decodedUsername, decodedTelephon, err := DecodeToken(token)

	// ASSERT
	require.NoError(t, err)                    // ✅ No debe haber error
	assert.Equal(t, username, decodedUsername) // ✅ Username decodificado coincide
	assert.Equal(t, telephon, decodedTelephon) // ✅ Telephon decodificado coincide
}

// TestDecodeTokenInvalid prueba que un token malformado causa error
func TestDecodeTokenInvalid(t *testing.T) {
	// ARRANGE
	invalidToken := "tokenInvalido123"

	// ACT
	decodedUsername, decodedTelephon, err := DecodeToken(invalidToken)

	// ASSERT
	require.Error(t, err)            // ✅ Debe haber un error
	assert.Empty(t, decodedUsername) // ✅ No devuelve username si hay error
	assert.Empty(t, decodedTelephon) // ✅ No devuelve telephon si hay error
}

// TestDecodeTokenExpired prueba que un token expirado causa error
func TestDecodeTokenExpired(t *testing.T) {
	// ARRANGE
	username := "usuarioTest"
	telephon := "12345678"
	// Generar un token que expiró hace 1 segundo
	token, err := GenerateTokenWithExpiry(username, telephon, -1)
	require.NoError(t, err) // ✅ El token debe generarse sin error

	// ACT
	decodedUsername, decodedTelephon, err := DecodeToken(token)

	// ASSERT
	require.Error(t, err)            // ✅ Debe haber error por expiración
	assert.Empty(t, decodedUsername) // ✅ No devuelve username si token está expirado
	assert.Empty(t, decodedTelephon) // ✅ No devuelve telephon si token está expirado
}

// TestGenerateTokenWithSpecialCharacters prueba que caracteres especiales se preservan
func TestGenerateTokenWithSpecialCharacters(t *testing.T) {
	// ARRANGE
	username := "user@example.com"
	telephon := "12345678"

	// ACT
	token, err := GenerateToken(username, telephon)
	require.NoError(t, err)

	decodedUsername, decodedTelephon, err := DecodeToken(token)

	// ASSERT
	require.NoError(t, err)
	assert.Equal(t, username, decodedUsername) // ✅ Caracteres especiales se preservan
	assert.Equal(t, telephon, decodedTelephon) // ✅ Telephon se preserva
}

// TestGenerateAndDecodeTokenFlow prueba el flujo completo: generar y decodificar
func TestGenerateAndDecodeTokenFlow(t *testing.T) {
	// ARRANGE
	type testCase struct {
		username string
		telephon string
	}
	testCases := []testCase{
		{"admin", "11111111"},
		{"user123", "22222222"},
		{"test.user", "33333333"},
		{"admin@company", "44444444"},
	}

	// ACT & ASSERT
	for _, tc := range testCases {
		t.Run(tc.username, func(t *testing.T) {
			// Generar
			token, err := GenerateToken(tc.username, tc.telephon)
			require.NoError(t, err)

			// Decodificar
			decodedUsername, decodedTelephon, err := DecodeToken(token)

			// Verificar
			require.NoError(t, err)
			assert.Equal(t, tc.username, decodedUsername)
			assert.Equal(t, tc.telephon, decodedTelephon)
		})
	}
}

// GenerateTokenWithExpiry es una función auxiliar para crear tokens con expiración custom
func GenerateTokenWithExpiry(username string, telephon string, expirySeconds int64) (string, error) {
	claim := jwt.MapClaims{}
	claim["username"] = username
	claim["telephon"] = telephon
	claim["exp"] = time.Now().Add(time.Duration(expirySeconds) * time.Second).Unix()
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claim)
	hash_token, err := token.SignedString(jwtSecret)
	if err != nil {
		return "", errors.New("Error al crear token")
	}
	return hash_token, nil
}
