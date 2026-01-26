package database

import (
	"context"
	"fmt"
	"os"
	"time"

	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

var MongoClient *mongo.Client
var MongoDB *mongo.Database

// ConnectMongo establece una conexión a MongoDB usando la variable de entorno
// MONGO_URI (por ejemplo: mongodb://user:pass@host:27017) y selecciona la base
// de datos por MONGO_DB (por defecto "test").
func ConnectMongo() (*mongo.Client, error) {
	uri := os.Getenv("MONGO_URI")
	// Si no se proporciona MONGO_URI, construirlo desde variables separadas
	if uri == "" {
		user := os.Getenv("MONGO_USER")
		pass := os.Getenv("MONGO_PASS")
		host := os.Getenv("MONGO_HOST")
		port := os.Getenv("MONGO_PORT")
		db := os.Getenv("MONGO_DB")

		if host == "" {
			host = "localhost"
		}
		if port == "" {
			port = "27017"
		}
		if db == "" {
			db = "test"
		}

		if user != "" && pass != "" {
			uri = fmt.Sprintf("mongodb://%s:%s@%s:%s/%s?authSource=admin", user, pass, host, port, db)
		} else {
			uri = fmt.Sprintf("mongodb://%s:%s/%s", host, port, db)
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	clientOpts := options.Client().ApplyURI(uri)
	client, err := mongo.Connect(ctx, clientOpts)
	if err != nil {
		return nil, err
	}

	if err := client.Ping(ctx, nil); err != nil {
		return nil, err
	}

	MongoClient = client
	dbName := os.Getenv("MONGO_DB")
	if dbName == "" {
		dbName = "test"
	}
	MongoDB = client.Database(dbName)

	fmt.Println("Conexión MongoDB establecida")
	return client, nil
}

// DisconnectMongo cierra la conexión al cliente MongoDB.
func DisconnectMongo() error {
	if MongoClient == nil {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return MongoClient.Disconnect(ctx)
}
