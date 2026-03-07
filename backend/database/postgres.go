package database

import (
	"fmt"
	"gorm/backend/models"
	"os"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

var db *gorm.DB

// Conection opens a PostgreSQL connection, applies all migrations (pre, auto,
// and post) and returns the ready-to-use *gorm.DB instance.
// It retries the initial dial up to 10 times with a 2-second back-off.
func Conection() (*gorm.DB, error) {
	host := os.Getenv("POSTGRES_HOST")
	port := os.Getenv("POSTGRES_PORT")
	user := os.Getenv("POSTGRES_USER")
	password := os.Getenv("POSTGRES_PASSWORD")
	dbname := os.Getenv("POSTGRES_DB")

	dsn := fmt.Sprintf(
		"host=%s user=%s password=%s dbname=%s port=%s sslmode=disable",
		host, user, password, dbname, port,
	)

	var data *gorm.DB
	var err error
	for i := 0; i < 10; i++ {
		data, err = gorm.Open(postgres.Open(dsn), &gorm.Config{})
		if err == nil {
			break
		}
		time.Sleep(2 * time.Second)
	}
	if err != nil {
		return nil, fmt.Errorf("postgres: could not connect after retries: %w", err)
	}

	// ── 1. PRE-MIGRATE: rename legacy columns before AutoMigrate ─────────────
	if err := RunPreMigrations(data); err != nil {
		return nil, err
	}

	// ── 2. AUTO-MIGRATE: sync schema with current models ─────────────────────
	if err := data.AutoMigrate(
		&models.UserDataBase{},
		&models.ContactDataBase{},
		&models.Message{},
		&models.CallLog{},
		&models.Group{},
		&models.GroupMember{},
		&models.GroupMessage{},
	); err != nil {
		return nil, fmt.Errorf("postgres: AutoMigrate failed: %w", err)
	}

	// ── 3. POST-MIGRATE: indexes, constraints, data normalization ─────────────
	if err := RunPostMigrations(data); err != nil {
		return nil, err
	}

	fmt.Println("Postgres: connection established, all migrations applied")
	db = data
	return db, nil
}
