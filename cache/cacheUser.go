package cache

import (
	"context"
	"errors"
	"gorm/repos"
	"time"

	"github.com/redis/go-redis/v9"
)

type CacheUser struct {
	rd *redis.Client
	repo *repos.RepositoriesUser
}

func InitChacheUser(rd *redis.Client, repo *repos.RepositoriesUser) *CacheUser{
	return &CacheUser{rd,repo}
}

func (ch *CacheUser) CacheUserExist(username string, ctx context.Context) (bool, error) {
	c, cancel := context.WithTimeout(ctx, 10 * time.Second)
	defer cancel()
	exist, err := ch.rd.Get(c,"username:"+username).Bool()
	if err != nil {
		exist := ch.repo.UsernameExist(username, c)
		err := ch.rd.Set(c, "username:"+username, exist, 3 * time.Minute).Err()
		if err != nil{
			return false, err
		}
		return exist, nil
	}
	return exist, nil
}
func (ch *CacheUser) CachePassword(username string, ctx context.Context) (string, error) {
	c, cancel := context.WithTimeout(ctx, 10 * time.Second)
	defer cancel()
	password, err := ch.rd.Get(c, "password:" + username).Result()
	if err != nil {
		passwordDB, exist := ch.repo.GetPassword(username, c)
		if !exist {
			return "",errors.New("username inexistente")
		}
		err := ch.rd.Set(c,"password:"+username, passwordDB, 2 * time.Minute)
		if err.Err() != nil {
			return "",err.Err() 
		}
		return passwordDB, nil
	}
	return password, nil
}
