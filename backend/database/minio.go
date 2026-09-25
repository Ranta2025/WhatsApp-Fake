package database

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// GetMinio crea el cliente del almacenamiento de objetos (MinIO o cualquier
// servicio compatible con S3, como Cloudflare R2) y verifica el bucket.
//
// Variables:
//   - MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_USE_SSL, MINIO_BUCKET
//   - MINIO_REGION: región S3 (R2 usa "auto"); vacío = la del servidor.
//   - MINIO_MANAGE_BUCKET: "false" para no crear el bucket ni cambiar su
//     política (proveedores gestionados donde el bucket y el acceso público se
//     configuran desde su panel y las credenciales no tienen permisos de admin).
func GetMinio() (*minio.Client, error) {
	endpoint := os.Getenv("MINIO_ENDPOINT")
	accessKey := os.Getenv("MINIO_ACCESS_KEY")
	secretKey := os.Getenv("MINIO_SECRET_KEY")
	useSSL := os.Getenv("MINIO_USE_SSL") == "true"
	manageBucket := os.Getenv("MINIO_MANAGE_BUCKET") != "false"

	client, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: useSSL,
		Region: os.Getenv("MINIO_REGION"),
	})
	if err != nil {
		return nil, fmt.Errorf("error creando cliente MinIO: %w", err)
	}

	bucket := os.Getenv("MINIO_BUCKET")
	if bucket == "" {
		bucket = "media"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	// Verificar conexión y bucket (BucketExists solo necesita permisos sobre
	// el bucket, a diferencia de ListBuckets)
	exists, err := client.BucketExists(ctx, bucket)
	if err != nil {
		return nil, fmt.Errorf("error conectando al almacenamiento (bucket '%s'): %w", bucket, err)
	}

	if !manageBucket {
		if !exists {
			return nil, fmt.Errorf("el bucket '%s' no existe; créalo en el panel del proveedor", bucket)
		}
		log.Printf("[DB] Almacenamiento S3 listo (endpoint: %s, bucket: %s)", endpoint, bucket)
		return client, nil
	}

	if !exists {
		if err := client.MakeBucket(ctx, bucket, minio.MakeBucketOptions{}); err != nil {
			return nil, fmt.Errorf("error creando bucket '%s': %w", bucket, err)
		}
		log.Printf("[DB] MinIO: bucket '%s' creado", bucket)
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

	if err := client.SetBucketPolicy(ctx, bucket, policy); err != nil {
		return nil, fmt.Errorf("error configurando política del bucket: %w", err)
	}

	log.Printf("[DB] Conexión con MinIO establecida (endpoint: %s, bucket: %s)", endpoint, bucket)
	return client, nil
}
