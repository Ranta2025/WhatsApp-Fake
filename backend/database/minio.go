package database

import (
	"context"
	"fmt"
	"os"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

func GetMinio() (*minio.Client, error) {
	endpoint := os.Getenv("MINIO_ENDPOINT")
	if endpoint == "" {
		endpoint = "localhost:9000"
	}

	accessKey := os.Getenv("MINIO_ACCESS_KEY")
	if accessKey == "" {
		accessKey = "minioadmin"
	}

	secretKey := os.Getenv("MINIO_SECRET_KEY")
	if secretKey == "" {
		secretKey = "minioadmin"
	}

	useSSL := os.Getenv("MINIO_USE_SSL") == "true"

	client, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: useSSL,
	})
	if err != nil {
		return nil, fmt.Errorf("error creando cliente MinIO: %w", err)
	}

	// Verificar conexión haciendo un ping (ListBuckets)
	_, err = client.ListBuckets(context.Background())
	if err != nil {
		return nil, fmt.Errorf("error conectando a MinIO: %w", err)
	}

	// Crear el bucket si no existe
	bucket := os.Getenv("MINIO_BUCKET")
	if bucket == "" {
		bucket = "media"
	}

	exists, err := client.BucketExists(context.Background(), bucket)
	if err != nil {
		return nil, fmt.Errorf("error verificando bucket: %w", err)
	}

	if !exists {
		err = client.MakeBucket(context.Background(), bucket, minio.MakeBucketOptions{})
		if err != nil {
			return nil, fmt.Errorf("error creando bucket '%s': %w", bucket, err)
		}
		fmt.Printf("MinIO: bucket '%s' creado\n", bucket)
	}

	// Establecer política de lectura pública para que las URLs sean accesibles directamente
	policy := fmt.Sprintf(`{
		"Version":"2012-10-17",
		"Statement":[{
			"Effect":"Allow",
			"Principal":{"AWS":["*"]},
			"Action":["s3:GetObject"],
			"Resource":["arn:aws:s3:::%s/*"]
		}]
	}`, bucket)

	err = client.SetBucketPolicy(context.Background(), bucket, policy)
	if err != nil {
		return nil, fmt.Errorf("error configurando política del bucket: %w", err)
	}

	fmt.Printf("MinIO conexion establecida (endpoint: %s, bucket: %s)\n", endpoint, bucket)
	return client, nil
}
