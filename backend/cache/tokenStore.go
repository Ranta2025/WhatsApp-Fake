package cache

import (
	"context"
	"errors"
	"time"

	"gorm/backend/utils"

	"github.com/redis/go-redis/v9"
)

// TokenStore abstrae el almacenamiento de refresh tokens para permitir
// rotación atómica y revocación. La implementación Redis guarda una clave por
// usuario (refresh:{username}) con TTL de 7 días.
type TokenStore interface {
	SaveRefreshToken(username, token string, ctx context.Context) error
	// RotateRefreshToken invalida el token viejo y guarda el nuevo en una sola
	// operación atómica (DEL old + SET new). Falla si el token viejo ya no es
	// el almacenado (p.ej. doble refresh concurrente).
	RotateRefreshToken(oldToken, newToken, username string, ctx context.Context) error
	ValidateRefreshToken(username, token string, ctx context.Context) error
	DeleteRefreshToken(username string, ctx context.Context) error
	RevokeAllForUser(username string, ctx context.Context) error
	IsBlacklisted(jti string, ctx context.Context) (bool, error)
	BlacklistToken(jti string, ttl time.Duration, ctx context.Context) error
}

// RedisTokenStore implementa TokenStore sobre Redis.
type RedisTokenStore struct {
	rd *redis.Client
}

// NewRedisTokenStore crea el TokenStore Redis. Debe llamarse una vez en main.
func NewRedisTokenStore(rd *redis.Client) TokenStore {
	return &RedisTokenStore{rd: rd}
}

func refreshKey(username string) string {
	return "refresh:" + username
}

// rotateScript implementa la rotación atómica con compare-and-swap:
//   - si el token almacenado NO es el token viejo → devuelve 0 (rotación rechazada)
//   - si coincide → DEL old + SET new (con TTL) en una sola operación atómica
var rotateScript = redis.NewScript(`
if redis.call("GET", KEYS[1]) ~= ARGV[1] then
    return 0
end
redis.call("DEL", KEYS[1])
redis.call("SET", KEYS[1], ARGV[2], "EX", ARGV[3])
return 1
`)

// SaveRefreshToken guarda (o sobrescribe) el refresh token de un usuario.
func (s *RedisTokenStore) SaveRefreshToken(username, token string, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	return s.rd.Set(c, refreshKey(username), token, utils.RefreshTokenDuration).Err()
}

// RotateRefreshToken borra el token viejo y guarda el nuevo atómicamente.
// Si el token viejo ya no es el almacenado (refresh doble/concurrente), falla
// para que el cliente vuelva a autenticarse.
func (s *RedisTokenStore) RotateRefreshToken(oldToken, newToken, username string, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	res, err := rotateScript.Run(c, s.rd, []string{refreshKey(username)},
		oldToken, newToken, int(utils.RefreshTokenDuration.Seconds())).Int()
	if err != nil {
		return err
	}
	if res != 1 {
		return errors.New("refresh token invalido o expirado")
	}
	return nil
}

// ValidateRefreshToken verifica que el token presentado sea el almacenado.
func (s *RedisTokenStore) ValidateRefreshToken(username, token string, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	stored, err := s.rd.Get(c, refreshKey(username)).Result()
	if err == redis.Nil {
		return errors.New("refresh token expirado o inexistente")
	}
	if err != nil {
		return err
	}
	if stored != token {
		return errors.New("refresh token invalido")
	}
	return nil
}

// DeleteRefreshToken elimina el refresh token de un usuario (logout).
func (s *RedisTokenStore) DeleteRefreshToken(username string, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	return s.rd.Del(c, refreshKey(username)).Err()
}

// RevokeAllForUser invalida todas las sesiones de un usuario. Con una clave
// por usuario equivale a DeleteRefreshToken.
func (s *RedisTokenStore) RevokeAllForUser(username string, ctx context.Context) error {
	return s.DeleteRefreshToken(username, ctx)
}

// IsBlacklisted indica si un jti está en la lista negra (access token revocado).
func (s *RedisTokenStore) IsBlacklisted(jti string, ctx context.Context) (bool, error) {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	n, err := s.rd.Exists(c, "blacklist:jti:"+jti).Result()
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

// BlacklistToken agrega un jti a la lista negra con TTL (normalmente el tiempo
// restante de vida del access token).
func (s *RedisTokenStore) BlacklistToken(jti string, ttl time.Duration, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	return s.rd.Set(c, "blacklist:jti:"+jti, "1", ttl).Err()
}
