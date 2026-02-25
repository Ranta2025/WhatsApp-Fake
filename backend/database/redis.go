package database

import (
	"context"
	"fmt"
	"os"

	"github.com/redis/go-redis/v9"
)

// GetRedis crea el cliente de Redis y verifica la conexión con un PING.
func GetRedis() (*redis.Client, error) {
	host := os.Getenv("REDIS_HOST")
	if host == "" {
		host = "localhost"
	}
	port := os.Getenv("REDIS_PORT")
	if port == "" {
		port = "6379"
	}
	addr := fmt.Sprintf("%s:%s", host, port)
	password := os.Getenv("REDIS_PASSWORD")
	db := 0
	rd := redis.NewClient(&redis.Options{Addr: addr, Password: password, DB: db})

	if err := rd.Ping(context.Background()).Err(); err != nil {
		return nil, err
	}
	fmt.Println("Redis conexion establecida")
	return rd, nil
}
