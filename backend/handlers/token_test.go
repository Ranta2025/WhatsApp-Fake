package handlers

import (
	"os"
	"testing"
	"time"

	"gorm/backend/utils"

	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// secretTestKey debe coincidir con la que se configura en utils via SECRETKEY
const secretTestKey = "test-secret-key-32-characters-long!!"

func setupJWTSecret(t *testing.T) {
	t.Helper()
	os.Setenv("SECRETKEY", secretTestKey)
	utils.ValidateJWTSecret()
}

// signToken firma un JWT HS256 con una clave arbitraria (no necesariamente la del app).
func signToken(t *testing.T, claims jwt.MapClaims, secret string) string {
	t.Helper()
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(secret))
	require.NoError(t, err)
	return signed
}

// C2: un JWT firmado con una clave desconocida (self-signed) debe ser rechazado.
// Antes del fix, decodeTokenIgnoreExpiry hacía fallback a ParseUnverified y lo aceptaba.
func TestDecodeTokenIgnoreExpiryRejectsSelfSignedToken(t *testing.T) {
	setupJWTSecret(t)

	// Firmado con clave distinta a SECRETKEY: firma inválida para la app
	tampered := signToken(t, jwt.MapClaims{
		"username": "attacker",
		"telephon": "00000000",
		"exp":      time.Now().Add(15 * time.Minute).Unix(),
	}, "another-secret-key-32-characters-long!!")

	username, telephon, err := decodeTokenIgnoreExpiry(tampered)
	assert.Error(t, err, "un token firmado con clave desconocida debe fallar la validación de firma")
	assert.Empty(t, username)
	assert.Empty(t, telephon)
}

// C2: un token bien formado pero no firmado (header.payload.firma inventada) debe ser rechazado.
func TestDecodeTokenIgnoreExpiryRejectsMalformedSignature(t *testing.T) {
	setupJWTSecret(t)

	headerPayload := "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6ImF0dGFja2VyIiwidGVsZXBob24iOiIwMDAwMDAwMCJ9"
	forged := headerPayload + ".AAAA"

	username, telephon, err := decodeTokenIgnoreExpiry(forged)
	assert.Error(t, err)
	assert.Empty(t, username)
	assert.Empty(t, telephon)
}

// Un token válido firmado con la clave de la app se decodifica correctamente.
func TestDecodeTokenIgnoreExpiryAcceptsValidToken(t *testing.T) {
	setupJWTSecret(t)

	token, err := utils.GenerateToken("user-ok", "12345678")
	require.NoError(t, err)

	username, telephon, err := decodeTokenIgnoreExpiry(token)
	assert.NoError(t, err)
	assert.Equal(t, "user-ok", username)
	assert.Equal(t, "12345678", telephon)
}

// Un token expirado hace menos del leeway (5 min) sigue siendo aceptado por el refresh flow.
func TestDecodeTokenIgnoreExpiryAcceptsTokenExpiredWithinLeeway(t *testing.T) {
	setupJWTSecret(t)

	expired := signToken(t, jwt.MapClaims{
		"username": "user-leeway",
		"telephon": "87654321",
		"exp":      time.Now().Add(-2 * time.Minute).Unix(), // 2 min vencido < leeway 5 min
	}, secretTestKey)

	username, telephon, err := decodeTokenIgnoreExpiry(expired)
	assert.NoError(t, err)
	assert.Equal(t, "user-leeway", username)
	assert.Equal(t, "87654321", telephon)
}

// Un token expirado hace MÁS del leeway (5 min) debe ser rechazado.
func TestDecodeTokenIgnoreExpiryRejectsTokenExpiredBeyondLeeway(t *testing.T) {
	setupJWTSecret(t)

	expired := signToken(t, jwt.MapClaims{
		"username": "user-old",
		"telephon": "87654321",
		"exp":      time.Now().Add(-10 * time.Minute).Unix(), // 10 min vencido > leeway 5 min
	}, secretTestKey)

	username, telephon, err := decodeTokenIgnoreExpiry(expired)
	assert.Error(t, err)
	assert.Empty(t, username)
	assert.Empty(t, telephon)
}
