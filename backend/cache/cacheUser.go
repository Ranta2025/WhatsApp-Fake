package cache

import (
	"context"
	"errors"
	"gorm/backend/repos"
	"gorm/backend/utils"
	"log"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
)

type CacheUser struct {
	rd   *redis.Client
	repo *repos.RepositoriesUser
}

// InitChacheUser crea el CacheUser con su cliente Redis y repositorio de usuarios.
func InitChacheUser(rd *redis.Client, repo *repos.RepositoriesUser) *CacheUser {
	return &CacheUser{rd, repo}
}

// --- Refresh Token en Redis ---

// SaveRefreshToken guarda un refresh token en Redis asociado al username
func (ch *CacheUser) SaveRefreshToken(username string, refreshToken string, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	return ch.rd.Set(c, "refresh:"+username, refreshToken, utils.RefreshTokenDuration).Err()
}

// GetRefreshToken obtiene el refresh token almacenado para un username
func (ch *CacheUser) GetRefreshToken(username string, ctx context.Context) (string, error) {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	return ch.rd.Get(c, "refresh:"+username).Result()
}

// DeleteRefreshToken elimina el refresh token de un username (logout)
func (ch *CacheUser) DeleteRefreshToken(username string, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	return ch.rd.Del(c, "refresh:"+username).Err()
}

// CachePassword obtiene el hash de contraseña del usuario directamente desde la BD.
// No se guarda en Redis para no exponer hashes sensibles en caché.
func (ch *CacheUser) CachePassword(username string, ctx context.Context) (string, error) {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	passwordDB, exist := ch.repo.GetPassword(username, c)
	if !exist {
		return "", errors.New("contraseña inexistente")
	}
	return passwordDB, nil
}

// CacheActivo revisa en Redis si el usuario está activo; si no está cacheado lo
// consulta en la BD y lo guarda con TTL de 2 min.
func (ch *CacheUser) CacheActivo(username string, ctx context.Context) (bool, error) {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	log.Println("[CACHE] Buscando activo para:", username)
	activo, err := ch.rd.Get(c, "activo:"+username).Result()
	if err != nil {
		log.Println("[CACHE] No encontrado en Redis, buscando en BD")
		activoDB, exist := ch.repo.GetActivo(username, c)
		if !exist {
			log.Println("[CACHE] activo no existe en BD para:", username)
			return false, errors.New("activo inexistente")
		}
		log.Println("[CACHE] activo encontrada en BD:", activoDB)
		err := ch.rd.Set(c, "activo:"+username, activoDB, 2*time.Minute)
		if err.Err() != nil {
			return false, err.Err()
		}
		return activoDB, nil
	}
	log.Println("[CACHE] activo encontrada en Redis:", activo)
	activoReturn, _ := strconv.ParseBool(activo)
	return activoReturn, nil
}

// SetCodigo guarda un código temporal en Redis con TTL de 10 min.
// tipoCodigo diferencia el tipo de código ("activacion", "recuperacion", etc.).
func (ch *CacheUser) SetCodigo(tipoCodigo string, username string, codigo string, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	return ch.rd.Set(c, "codigo"+tipoCodigo+":"+username, codigo, 10*time.Minute).Err()
}

// GetCodigo recupera el código temporal guardado en Redis para el usuario.
func (ch *CacheUser) GetCodigo(tipoCodigo string, username string, ctx context.Context) (string, error) {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	codigo, err := ch.rd.Get(c, "codigo"+tipoCodigo+":"+username).Result()
	return codigo, err
}

// DeleteActivationCode elimina el código de activación del usuario de Redis.
func (ch *CacheUser) DeleteActivationCode(username string, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	return ch.rd.Del(c, "codigoactivacion:"+username).Err()
}

// CacheBloqueado revisa en Redis si el usuario está bloqueado; si no está cacheado lo
// consulta en la BD y lo almacena con TTL de 2 min.
func (ch *CacheUser) CacheBloqueado(username string, ctx context.Context) (bool, error) {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	bloqueado, err := ch.rd.Get(c, "bloqueado:"+username).Result()
	if err != nil {
		bloqueadoDB, exist := ch.repo.GetBlocked(username, c)
		if !exist {
			log.Println("[CACHE] bloqueado no existe en BD para:", username)
			return false, errors.New("bloqueado inexistente")
		}
		err := ch.rd.Set(c, "bloqueado:"+username, bloqueadoDB, 2*time.Minute)
		if err.Err() != nil {
			return false, err.Err()
		}
		return bloqueadoDB, nil
	}
	bloqueadoReturn, _ := strconv.ParseBool(bloqueado)
	return bloqueadoReturn, nil
}

// GetIntentosFallidos devuelve el contador de intentos fallidos de login
// almacenado en Redis; retorna 0 si no existe clave.
func (ch *CacheUser) GetIntentosFallidos(username string, ctx context.Context) (int, error) {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	intentos, err := ch.rd.Get(c, "intentos:"+username).Result()
	if err == redis.Nil {
		return 0, nil
	}
	intentosInt, err := strconv.Atoi(intentos)
	if err != nil {
		return 0, err
	}
	return intentosInt, nil
}

// IncrementFailedAttempts incrementa atómicamente el contador de intentos fallidos
// en Redis usando INCR y establece TTL de 30 min. Devuelve el nuevo valor.
func (ch *CacheUser) IncrementFailedAttempts(username string, ctx context.Context) (int, error) {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	key := "intentos:" + username

	newVal, err := ch.rd.Incr(c, key).Result()
	if err != nil {
		return 0, err
	}

	if newVal == 1 {
		ch.rd.Expire(c, key, 30*time.Minute)
	}
	return int(newVal), nil
}

// ResetFailedAttempts resetea (elimina) el contador de intentos fallidos de login.
func (ch *CacheUser) ResetFailedAttempts(username string, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	return ch.rd.Del(c, "intentos:"+username).Err()
}
