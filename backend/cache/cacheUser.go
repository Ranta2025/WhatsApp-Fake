package cache

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"gorm/backend/utils"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	codigoTTL           = 10 * time.Minute
	intentosFallidosTTL = 30 * time.Minute
)

type CacheUser struct {
	rd *redis.Client
}

// InitChacheUser crea el CacheUser con su cliente Redis.
func InitChacheUser(rd *redis.Client) *CacheUser {
	return &CacheUser{rd: rd}
}

// --- Refresh Tokens en Redis ---
//
// Cada refresh token se guarda indexado por su hash SHA-256 (nunca en claro) y
// apunta al teléfono del usuario (identificador inmutable). Además se mantiene
// un set por usuario con todos sus tokens activos para poder revocarlos todos
// (cambio de contraseña, bloqueo). Así se admiten varias sesiones/dispositivos
// y el refresh no depende del access token expirado.

func refreshTokenKey(refreshToken string) string {
	sum := sha256.Sum256([]byte(refreshToken))
	return "refresh:token:" + hex.EncodeToString(sum[:])
}

func refreshUserKey(telephon string) string {
	return "refresh:user:" + telephon
}

// SaveRefreshToken guarda un refresh token asociado al teléfono del usuario.
func (ch *CacheUser) SaveRefreshToken(telephon string, refreshToken string, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	tokenKey := refreshTokenKey(refreshToken)
	userKey := refreshUserKey(telephon)
	pipe := ch.rd.TxPipeline()
	pipe.Set(c, tokenKey, telephon, utils.RefreshTokenDuration)
	pipe.SAdd(c, userKey, tokenKey)
	pipe.Expire(c, userKey, utils.RefreshTokenDuration)
	_, err := pipe.Exec(c)
	return err
}

// GetRefreshTokenOwner devuelve el teléfono del usuario dueño del refresh token.
func (ch *CacheUser) GetRefreshTokenOwner(refreshToken string, ctx context.Context) (string, error) {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	return ch.rd.Get(c, refreshTokenKey(refreshToken)).Result()
}

// DeleteRefreshToken invalida un refresh token concreto (logout / rotación).
func (ch *CacheUser) DeleteRefreshToken(refreshToken string, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	tokenKey := refreshTokenKey(refreshToken)
	telephon, err := ch.rd.GetDel(c, tokenKey).Result()
	if errors.Is(err, redis.Nil) {
		return nil
	}
	if err != nil {
		return err
	}
	return ch.rd.SRem(c, refreshUserKey(telephon), tokenKey).Err()
}

// RevokeAllRefreshTokens invalida todas las sesiones del usuario.
func (ch *CacheUser) RevokeAllRefreshTokens(telephon string, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	userKey := refreshUserKey(telephon)
	tokenKeys, err := ch.rd.SMembers(c, userKey).Result()
	if err != nil && !errors.Is(err, redis.Nil) {
		return err
	}
	return ch.rd.Del(c, append(tokenKeys, userKey)...).Err()
}

// --- Códigos de verificación ---

func codigoKey(tipoCodigo, key string) string {
	return "codigo" + tipoCodigo + ":" + key
}

func codigoIntentosKey(tipoCodigo, key string) string {
	return "codigo_intentos" + tipoCodigo + ":" + key
}

// SetCodigo guarda un código temporal en Redis con TTL de 10 min y reinicia
// el contador de intentos fallidos de ese código.
// tipoCodigo diferencia el tipo de código ("activacion", "bloqueado", "forgot").
func (ch *CacheUser) SetCodigo(tipoCodigo string, key string, codigo string, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	pipe := ch.rd.TxPipeline()
	pipe.Set(c, codigoKey(tipoCodigo, key), codigo, codigoTTL)
	pipe.Del(c, codigoIntentosKey(tipoCodigo, key))
	_, err := pipe.Exec(c)
	return err
}

// GetCodigo recupera el código temporal guardado en Redis.
func (ch *CacheUser) GetCodigo(tipoCodigo string, key string, ctx context.Context) (string, error) {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	return ch.rd.Get(c, codigoKey(tipoCodigo, key)).Result()
}

// DeleteCodigo elimina el código (y su contador de intentos) para que no pueda reutilizarse.
func (ch *CacheUser) DeleteCodigo(tipoCodigo string, key string, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	return ch.rd.Del(c, codigoKey(tipoCodigo, key), codigoIntentosKey(tipoCodigo, key)).Err()
}

// IncrCodigoIntentos incrementa y devuelve el número de intentos fallidos del código.
func (ch *CacheUser) IncrCodigoIntentos(tipoCodigo string, key string, ctx context.Context) (int, error) {
	return ch.incrWithTTL(codigoIntentosKey(tipoCodigo, key), codigoTTL, ctx)
}

// --- Intentos fallidos de login ---

// IncrIntentosFallidos incrementa de forma atómica el contador de intentos
// fallidos de login (TTL de 30 min desde el primer fallo) y devuelve el nuevo valor.
func (ch *CacheUser) IncrIntentosFallidos(username string, ctx context.Context) (int, error) {
	return ch.incrWithTTL("intentos:"+username, intentosFallidosTTL, ctx)
}

// ResetIntentosFallidos borra el contador de intentos fallidos de login.
func (ch *CacheUser) ResetIntentosFallidos(username string, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	return ch.rd.Del(c, "intentos:"+username).Err()
}

// incrWithTTL incrementa un contador y le asigna TTL solo al crearse.
func (ch *CacheUser) incrWithTTL(key string, ttl time.Duration, ctx context.Context) (int, error) {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	n, err := ch.rd.Incr(c, key).Result()
	if err != nil {
		return 0, err
	}
	if n == 1 {
		ch.rd.Expire(c, key, ttl)
	}
	return int(n), nil
}
