package cache

import (
	"context"
	"errors"
	"gorm/repos"
	"log"
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
