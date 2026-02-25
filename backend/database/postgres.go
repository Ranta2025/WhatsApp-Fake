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

// Conection abre la conexión a PostgreSQL, ejecuta AutoMigrate para sincronizar el
// esquema y aplica índices/constraints adicionales. Reintenta hasta 10 veces antes
// de devolver error.
func Conection() (*gorm.DB, error) {
	host := os.Getenv("POSTGRES_HOST")
	if host == "" {
		host = "localhost"
	}
	port := os.Getenv("POSTGRES_PORT")
	if port == "" {
		port = "5432"
	}
	user := os.Getenv("POSTGRES_USER")
	if user == "" {
		user = "gorm"
	}
	password := os.Getenv("POSTGRES_PASSWORD")
	dbname := os.Getenv("POSTGRES_DB")
	if dbname == "" {
		dbname = "gorm"
	}

	dsn := fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=%s sslmode=disable",
		host,
		user,
		password,
		dbname,
		port)
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
		fmt.Println("Error al conectar con base de datos")
		return nil, err
	}
	if err := data.AutoMigrate(&models.UserDataBase{}, &models.ContactDataBase{}, &models.Message{}, &models.CallLog{}); err != nil {
		fmt.Println("Error al migrar base de datos")
		return nil, err
	}
	data.Exec("ALTER TABLE contact_data_bases ALTER COLUMN status TYPE VARCHAR(25);")

	// Índice único parcial: evita contactos duplicados pero permite soft-deletes
	// Solo aplica a filas donde deleted_at IS NULL
	data.Exec(`DROP INDEX IF EXISTS idx_user_contact`)
	data.Exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_user_contact_active
		ON contact_data_bases (id_user, id_contact)
		WHERE deleted_at IS NULL`)

	data.Exec(`DO $$ BEGIN
		IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_contact_data_bases_user') THEN
			ALTER TABLE contact_data_bases DROP CONSTRAINT fk_contact_data_bases_user;
		END IF;
		IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_contact_data_bases_user_contact') THEN
			ALTER TABLE contact_data_bases DROP CONSTRAINT fk_contact_data_bases_user_contact;
		END IF;
	END $$;`)
	data.Exec(`DO $$ BEGIN
		IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
			DROP TABLE users;
		END IF;
	END $$;`)
	fmt.Println("Postgres, Coneccion establecida")
	db = data
	return db, nil
}
