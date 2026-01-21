package cache

import (
	"gorm/repos"

	"github.com/redis/go-redis/v9"
)

type CacheUser struct {
	rd *redis.Client
	repo *repos.RepositoriesUser
}

func InitChacheUser(rd *redis.Client, repo *repos.RepositoriesUser) *CacheUser{
	return &CacheUser{rd,repo}
}

