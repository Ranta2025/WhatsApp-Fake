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
// Si existe REDIS_URL (redis:// o rediss:// con TLS, como Upstash o Render
// Key Value) se usa; si no, REDIS_HOST / REDIS_PORT / REDIS_PASSWORD.
func GetRedis() (*redis.Client, error) {
	var opts *redis.Options
	if url := os.Getenv("REDIS_URL"); url != "" {
		parsed, err := redis.ParseURL(url)
		if err != nil {
			return nil, fmt.Errorf("REDIS_URL inválida: %w", err)
		}
		opts = parsed
	} else {
		opts = &redis.Options{
			Addr:     fmt.Sprintf("%s:%s", os.Getenv("REDIS_HOST"), os.Getenv("REDIS_PORT")),
			Password: os.Getenv("REDIS_PASSWORD"),
			DB:       0,
		}
	}
	rd := redis.NewClient(opts)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := rd.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("error conectando a Redis: %w", err)
	}
	log.Println("[DB] Conexión con Redis establecida")
	return rd, nil
}
