package database

import (
	"github.com/minio/minio-go/v7"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

// GetConection inicializa y devuelve las tres conexiones necesarias para la app:
// PostgreSQL (GORM), Redis y MinIO. Devuelve error si alguna falla.
func GetConection() (*gorm.DB, *redis.Client, *minio.Client, error) {
	data, err := Conection()
	if err != nil {
		return nil, nil, nil, err
	}

	rd, err := GetRedis()
	if err != nil {
		return nil, nil, nil, err
	}

	mc, err := GetMinio()
	if err != nil {
		return nil, nil, nil, err
	}

	return data, rd, mc, nil
}
