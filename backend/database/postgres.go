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
	// ─────────────────────────────────────────────────────────────────────────
	// PRE-MIGRATION: renombrar columnas legacy antes de que AutoMigrate intente
	// crear columnas nuevas con el nombre correcto.
	// ─────────────────────────────────────────────────────────────────────────

	// reply_to_username → reply_to_telephon
	// (el campo almacena un número de teléfono, nombre anterior era incorrecto)
	data.Exec(`DO $$ BEGIN
		IF EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_name = 'messages' AND column_name = 'reply_to_username'
		) AND NOT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_name = 'messages' AND column_name = 'reply_to_telephon'
		) THEN
			ALTER TABLE messages RENAME COLUMN reply_to_username TO reply_to_telephon;
		END IF;
	END $$;`)

	// ─────────────────────────────────────────────────────────────────────────
	// AUTO-MIGRATE: sincroniza el esquema con los modelos actuales
	// ─────────────────────────────────────────────────────────────────────────
	if err := data.AutoMigrate(&models.UserDataBase{}, &models.ContactDataBase{}, &models.Message{}, &models.CallLog{}); err != nil {
		fmt.Println("Error al migrar base de datos")
		return nil, err
	}

	// ─────────────────────────────────────────────────────────────────────────
	// POST-MIGRATION: patches de columnas, índices y constraints
	// Todas las operaciones son idempotentes (seguras en cada arranque).
	// ─────────────────────────────────────────────────────────────────────────

	// Asegurar tamaño correcto de columnas
	data.Exec(`ALTER TABLE contact_data_bases ALTER COLUMN status TYPE VARCHAR(25)`)
	data.Exec(`ALTER TABLE user_data_bases ALTER COLUMN password TYPE VARCHAR(100)`)

	// Índice único parcial en contactos: evita duplicados activos, permite soft-deletes
	data.Exec(`DROP INDEX IF EXISTS idx_user_contact`)
	data.Exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_user_contact_active
		ON contact_data_bases (id_user, id_contact)
		WHERE deleted_at IS NULL`)

	// Eliminar FKs auto-generadas por GORM (reemplazadas por referencia lógica)
	data.Exec(`DO $$ BEGIN
		IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_contact_data_bases_user') THEN
			ALTER TABLE contact_data_bases DROP CONSTRAINT fk_contact_data_bases_user;
		END IF;
		IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_contact_data_bases_user_contact') THEN
			ALTER TABLE contact_data_bases DROP CONSTRAINT fk_contact_data_bases_user_contact;
		END IF;
	END $$;`)

	// Eliminar tabla 'users' legacy si aún existe
	data.Exec(`DO $$ BEGIN
		IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
			DROP TABLE users;
		END IF;
	END $$;`)

	// ─────────────────────────────────────────────────────────────────────────
	// ÍNDICES DE RENDIMIENTO: consultas de conversación en messages
	// Sin estos índices, cada carga de chat es un sequential scan.
	// ─────────────────────────────────────────────────────────────────────────

	// Índice compuesto para la query principal de conversación:
	// WHERE (id_user=A AND id_receptor=B) OR (id_user=B AND id_receptor=A) ORDER BY time ASC
	data.Exec(`CREATE INDEX IF NOT EXISTS idx_messages_conv
		ON messages (id_user, id_receptor, time)
		WHERE deleted_at IS NULL`)
	data.Exec(`CREATE INDEX IF NOT EXISTS idx_messages_conv_rev
		ON messages (id_receptor, id_user, time)
		WHERE deleted_at IS NULL`)

	// Índice parcial para consulta de mensajes pendientes de entrega
	// (usado al reconectarse para marcar como "entregado")
	data.Exec(`CREATE INDEX IF NOT EXISTS idx_messages_pending
		ON messages (id_receptor, status)
		WHERE status = 'enviado' AND deleted_at IS NULL`)

	// ─────────────────────────────────────────────────────────────────────────
	// MIGRACIÓN DE DATOS: normalizar valores de status legacy
	// ─────────────────────────────────────────────────────────────────────────
	data.Exec(`UPDATE contact_data_bases SET status = 'rejected' WHERE status = 'rechazed'`)
	data.Exec(`UPDATE contact_data_bases SET status = 'pending'  WHERE status = 'pendiente'`)

	// ─────────────────────────────────────────────────────────────────────────
	// CHECK CONSTRAINTS: garantizar integridad de datos a nivel de base de datos
	// Se usan DO blocks para hacerlos idempotentes.
	// ─────────────────────────────────────────────────────────────────────────
	data.Exec(`DO $$ BEGIN
		-- messages.status
		IF NOT EXISTS (
			SELECT 1 FROM information_schema.constraint_column_usage
			WHERE table_name = 'messages' AND constraint_name = 'chk_messages_status'
		) THEN
			ALTER TABLE messages ADD CONSTRAINT chk_messages_status
				CHECK (status IN ('enviado', 'entregado', 'visto'));
		END IF;

		-- messages.media_type
		-- Valores posibles:  '' (texto puro), 'image', 'audio', 'video', 'sticker', 'document'
		-- 'document' lo asigna serviceMedia.go para PDF/Word/Excel/PPT/TXT
		-- 'sticker'  lo mantiene el model como tipo válido
		IF NOT EXISTS (
			SELECT 1 FROM information_schema.constraint_column_usage
			WHERE table_name = 'messages' AND constraint_name = 'chk_messages_media_type'
		) THEN
			ALTER TABLE messages ADD CONSTRAINT chk_messages_media_type
				CHECK (media_type IS NULL OR media_type = '' OR media_type IN ('image', 'audio', 'video', 'sticker', 'document'));
		END IF;

		-- call_logs.call_type
		IF NOT EXISTS (
			SELECT 1 FROM information_schema.constraint_column_usage
			WHERE table_name = 'call_logs' AND constraint_name = 'chk_call_logs_call_type'
		) THEN
			ALTER TABLE call_logs ADD CONSTRAINT chk_call_logs_call_type
				CHECK (call_type IN ('video', 'audio'));
		END IF;

		-- call_logs.status
		IF NOT EXISTS (
			SELECT 1 FROM information_schema.constraint_column_usage
			WHERE table_name = 'call_logs' AND constraint_name = 'chk_call_logs_status'
		) THEN
			ALTER TABLE call_logs ADD CONSTRAINT chk_call_logs_status
				CHECK (status IN ('answered', 'missed', 'rejected', 'unavailable'));
		END IF;

		-- contact_data_bases.status (ejecutar DESPUÉS de la migración de datos)
		IF NOT EXISTS (
			SELECT 1 FROM information_schema.constraint_column_usage
			WHERE table_name = 'contact_data_bases' AND constraint_name = 'chk_contacts_status'
		) THEN
			ALTER TABLE contact_data_bases ADD CONSTRAINT chk_contacts_status
				CHECK (status IN ('pending', 'accepted', 'rejected'));
		END IF;
	END $$;`)

	fmt.Println("Postgres, Coneccion establecida")
	db = data
	return db, nil
}
