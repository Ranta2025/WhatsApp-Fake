package cache

import (
	"context"
	"errors"
	"gorm/backend/repos"
	"log"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
)

type CacheUser struct {
	rd   *redis.Client
	repo *repos.RepositoriesUser
}

func InitChacheUser(rd *redis.Client, repo *repos.RepositoriesUser) *CacheUser {
	return &CacheUser{rd, repo}
}

func (ch *CacheUser) CachePassword(username string, ctx context.Context) (string, error) {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	log.Println("[CACHE] Buscando password para:", username)
	password, err := ch.rd.Get(c, "password:"+username).Result()
	if err != nil {
		log.Println("[CACHE] No encontrado en Redis, buscando en BD")
		passwordDB, exist := ch.repo.GetPassword(username, c)
		if !exist {
			log.Println("[CACHE] Password no existe en BD para:", username)
			return "", errors.New("contraseña inexistente")
		}
		log.Println("[CACHE] Password encontrada en BD:", passwordDB)
		err := ch.rd.Set(c, "password:"+username, passwordDB, 2*time.Minute)
		if err.Err() != nil {
			return "", err.Err()
		}
		return passwordDB, nil
	}
	log.Println("[CACHE] Password encontrada en Redis:", password)
	return password, nil
}

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
	activoReturn,_ := strconv.ParseBool(activo)
	return activoReturn, nil
}

func (ch *CacheUser) SetCodigo(username string ,codigo string, ctx context.Context) (error) {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	return ch.rd.Set(c,"codigo:"+username, codigo, 10 * time.Minute).Err()
}

func (ch *CacheUser) GetCodigo(username string, ctx context.Context) (string, error) {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	codigo, err := ch.rd.Get(c, username).Result()
	return codigo, err
}