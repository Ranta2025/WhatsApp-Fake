package utils

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"log"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// jwtSecret almacena la clave secreta validada al inicio
var jwtSecret []byte

// Duración del access token (15 minutos)
const AccessTokenDuration = 15 * time.Minute

// Duración del refresh token (7 días)
const RefreshTokenDuration = 7 * 24 * time.Hour

// ValidateJWTSecret verifica que SECRETKEY esté configurada y sea suficientemente larga.
// Debe llamarse al arrancar la aplicación; hace log.Fatal si no está configurada.
func ValidateJWTSecret() {
	key := os.Getenv("SECRETKEY")
	if len(key) < 32 {
		log.Fatal("[FATAL] SECRETKEY no está configurada o es demasiado corta (mínimo 32 caracteres)")
	}
	jwtSecret = []byte(key)
}

// GetJWTSecret retorna la clave secreta JWT (solo lectura).
func GetJWTSecret() []byte {
	return jwtSecret
}

func GenerateToken(username string, telephon string) (string, error) {
	claim := jwt.MapClaims{}
	claim["username"] = username
	claim["telephon"] = telephon
	claim["sub"] = username
	claim["jti"] = uuid.New().String()
	claim["iat"] = time.Now().Unix()
	claim["exp"] = time.Now().Add(AccessTokenDuration).Unix()

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claim)
	hash_token, err := token.SignedString(jwtSecret)
	if err != nil {
		return "", errors.New("error al crear token")
	}
	return hash_token, nil
}

// GenerateRefreshJWT genera un refresh token firmado como JWT con claims sub, jti, exp (7 días), iat.
func GenerateRefreshJWT(username string) (string, error) {
	claim := jwt.MapClaims{}
	claim["sub"] = username
	claim["jti"] = uuid.New().String()
	claim["iat"] = time.Now().Unix()
	claim["exp"] = time.Now().Add(RefreshTokenDuration).Unix()

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claim)
	signed, err := token.SignedString(jwtSecret)
	if err != nil {
		return "", errors.New("error al generar refresh token")
	}
	return signed, nil
}

// GenerateRefreshToken genera un refresh token aleatorio de 64 bytes (128 hex chars)
func GenerateRefreshToken() (string, error) {
	b := make([]byte, 64)
	_, err := rand.Read(b)
	if err != nil {
		return "", errors.New("error al generar refresh token")
	}
	return hex.EncodeToString(b), nil
}

// DecodeToken decodifica el token y devuelve username y telephon
func DecodeToken(token string) (string, string, error) {
	tokenDecode, err := jwt.Parse(token, func(t *jwt.Token) (interface{}, error) {
		if t.Method.Alg() != jwt.SigningMethodHS256.Alg() {
			return nil, errors.New("token invalido")
		}
		return jwtSecret, nil
	})

	if err != nil || !tokenDecode.Valid {
		return "", "", errors.New("token invalido")
	}

	claims, ok := tokenDecode.Claims.(jwt.MapClaims)
	if !ok {
		return "", "", errors.New("error al extraer datos del token")
	}

	username, ok := claims["username"].(string)
	if !ok {
		return "", "", errors.New("token claims invalidos")
	}
	telephon, ok := claims["telephon"].(string)
	if !ok {
		return "", "", errors.New("token claims invalidos")
	}

	return username, telephon, nil
}

// DecodeTokenWithLeeway parsea un JWT con firma validada pero permite tokens
// con expiración levemente pasada (útil para refresh flow).
func DecodeTokenWithLeeway(tokenStr string) (string, string, error) {
	tokenDecode, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		if t.Method.Alg() != jwt.SigningMethodHS256.Alg() {
			return nil, errors.New("token invalido")
		}
		return jwtSecret, nil
	}, jwt.WithLeeway(5*time.Minute))

	if err != nil || !tokenDecode.Valid {
		return "", "", errors.New("token invalido")
	}

	claims, ok := tokenDecode.Claims.(jwt.MapClaims)
	if !ok {
		return "", "", errors.New("error al extraer datos del token")
	}

	username, ok := claims["username"].(string)
	if !ok {
		return "", "", errors.New("token claims invalidos")
	}
	telephon, ok := claims["telephon"].(string)
	if !ok {
		return "", "", errors.New("token claims invalidos")
	}

	return username, telephon, nil
}
