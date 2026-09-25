package database

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/redis/go-redis/v9"
)

// GetRedis crea el cliente de Redis y verifica la conexión con un PING.
func GetRedis() (*redis.Client, error) {
	host := os.Getenv("REDIS_HOST")
	port := os.Getenv("REDIS_PORT")
	addr := fmt.Sprintf("%s:%s", host, port)
	password := os.Getenv("REDIS_PASSWORD")
	db := 0
	rd := redis.NewClient(&redis.Options{Addr: addr, Password: password, DB: db})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := rd.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("error conectando a Redis: %w", err)
	}
	log.Println("[DB] Conexión con Redis establecida")
	return rd, nil
}
