package database

import (
	"context"
	"fmt"

	"github.com/redis/go-redis/v9"
)

func GetRedis() (*redis.Client, error){
	rd := redis.NewClient(&redis.Options{
		Addr: "localhost:6379",
		Password: "",
		DB: 0,
	})
	
	if err := rd.Ping(context.Background()).Err(); err != nil {
		return nil, err
	}
	fmt.Println("Redis conexion establecida")
	return rd, nil
}