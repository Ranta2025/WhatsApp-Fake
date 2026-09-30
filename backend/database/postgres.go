package database

import (
	"fmt"
	"gorm/backend/models"
	"log"
	"os"
	"strconv"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// execMigration ejecuta una sentencia idempotente de migración y registra el
// error si falla (antes los errores se ignoraban en silencio).
func execMigration(db *gorm.DB, sql string) {
	if err := db.Exec(sql).Error; err != nil {
		log.Printf("[DB] Error en migración: %v\n%s", err, sql)
	}
}

// configurePool ajusta el pool de conexiones de database/sql.
func configurePool(data *gorm.DB) error {
	sqlDB, err := data.DB()
	if err != nil {
		return err
	}
	sqlDB.SetMaxOpenConns(envInt("POSTGRES_MAX_OPEN_CONNS", 25))
	sqlDB.SetMaxIdleConns(envInt("POSTGRES_MAX_IDLE_CONNS", 10))
	sqlDB.SetConnMaxLifetime(30 * time.Minute)
	sqlDB.SetConnMaxIdleTime(5 * time.Minute)
	return nil
}

func envInt(key string, def int) int {
	if v, err := strconv.Atoi(os.Getenv(key)); err == nil && v > 0 {
		return v
	}
	return def
}

// Conection abre la conexión a PostgreSQL, ejecuta AutoMigrate para sincronizar el
// esquema y aplica índices/constraints adicionales. Reintenta hasta 10 veces antes
// de devolver error.
func Conection() (*gorm.DB, error) {
	host := os.Getenv("POSTGRES_HOST")
	port := os.Getenv("POSTGRES_PORT")
	user := os.Getenv("POSTGRES_USER")
	password := os.Getenv("POSTGRES_PASSWORD")
	dbname := os.Getenv("POSTGRES_DB")

	sslmode := os.Getenv("POSTGRES_SSLMODE")
	if sslmode == "" {
		sslmode = "disable"
	}
	dsn := fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=%s sslmode=%s",
		host,
		user,
		password,
		dbname,
		port,
		sslmode)
	// DATABASE_URL (formato postgres://...) tiene prioridad: es lo que dan los
	// proveedores gestionados (Neon, Render, Supabase), normalmente con sslmode=require.
	if url := os.Getenv("DATABASE_URL"); url != "" {
		dsn = url
	}
	var data *gorm.DB
	var err error
	for i := 0; i < 10; i++ {
		data, err = gorm.Open(postgres.Open(dsn), &gorm.Config{
			Logger: logger.Default.LogMode(logger.Warn),
		})
		if err == nil {
			break
		}
		time.Sleep(2 * time.Second)
	}
	if err != nil {
		return nil, fmt.Errorf("error al conectar con la base de datos: %w", err)
	}
	if err := configurePool(data); err != nil {
		return nil, err
	}
	// ─────────────────────────────────────────────────────────────────────────
	// PRE-MIGRATION: renombrar columnas legacy antes de que AutoMigrate intente
	// crear columnas nuevas con el nombre correcto.
	// ─────────────────────────────────────────────────────────────────────────

	// reply_to_username → reply_to_telephon
	// (el campo almacena un número de teléfono, nombre anterior era incorrecto)
	execMigration(data, `DO $$ BEGIN
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
	if err := data.AutoMigrate(
		&models.UserDataBase{},
		&models.ContactDataBase{},
		&models.Message{},
		&models.CallLog{},
		// ── Grupos ──────────────────────────────────────────────────────────
		&models.Group{},
		&models.GroupMember{},
		&models.GroupMessage{},
		// ── Estados (stories) ──────────────────────────────────────────────
		&models.Status{},
		&models.StatusView{},
	); err != nil {
		return nil, fmt.Errorf("error al migrar la base de datos: %w", err)
	}

	// ─────────────────────────────────────────────────────────────────────────
	// POST-MIGRATION: patches de columnas, índices y constraints
	// Todas las operaciones son idempotentes (seguras en cada arranque).
	// ─────────────────────────────────────────────────────────────────────────

	// Asegurar tamaño correcto de columnas
	execMigration(data, `ALTER TABLE contact_data_bases ALTER COLUMN status TYPE VARCHAR(25)`)
	execMigration(data, `ALTER TABLE user_data_bases ALTER COLUMN password TYPE VARCHAR(100)`)

	// Índice único parcial en contactos: evita duplicados activos, permite soft-deletes
	execMigration(data, `DROP INDEX IF EXISTS idx_user_contact`)
	execMigration(data, `CREATE UNIQUE INDEX IF NOT EXISTS idx_user_contact_active
		ON contact_data_bases (id_user, id_contact)
		WHERE deleted_at IS NULL`)

	// Eliminar FKs auto-generadas por GORM (reemplazadas por referencia lógica)
	execMigration(data, `DO $$ BEGIN
		IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_contact_data_bases_user') THEN
			ALTER TABLE contact_data_bases DROP CONSTRAINT fk_contact_data_bases_user;
		END IF;
		IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_contact_data_bases_user_contact') THEN
			ALTER TABLE contact_data_bases DROP CONSTRAINT fk_contact_data_bases_user_contact;
		END IF;
	END $$;`)

	// Eliminar tabla 'users' legacy si aún existe
	execMigration(data, `DO $$ BEGIN
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
	execMigration(data, `CREATE INDEX IF NOT EXISTS idx_messages_conv
		ON messages (id_user, id_receptor, time)
		WHERE deleted_at IS NULL`)
	execMigration(data, `CREATE INDEX IF NOT EXISTS idx_messages_conv_rev
		ON messages (id_receptor, id_user, time)
		WHERE deleted_at IS NULL`)

	// Índices para paginación por cursor (id < before ORDER BY id DESC) del chat 1:1.
	execMigration(data, `CREATE INDEX IF NOT EXISTS idx_messages_conv_cursor
		ON messages (id_user, id_receptor, id)
		WHERE deleted_at IS NULL`)
	execMigration(data, `CREATE INDEX IF NOT EXISTS idx_messages_conv_cursor_rev
		ON messages (id_receptor, id_user, id)
		WHERE deleted_at IS NULL`)

	// Índice parcial para consulta de mensajes pendientes de entrega
	// (usado al reconectarse para marcar como "entregado")
	execMigration(data, `CREATE INDEX IF NOT EXISTS idx_messages_pending
		ON messages (id_receptor, status)
		WHERE status = 'enviado' AND deleted_at IS NULL`)

	// Búsqueda de llamadas por sala (actualizar estado al aceptar/rechazar/colgar)
	execMigration(data, `CREATE INDEX IF NOT EXISTS idx_call_logs_room_id ON call_logs (room_id)`)

	// ─────────────────────────────────────────────────────────────────────────
	// MIGRACIÓN DE DATOS: normalizar valores de status legacy
	// ─────────────────────────────────────────────────────────────────────────
	execMigration(data, `UPDATE contact_data_bases SET status = 'rejected' WHERE status = 'rechazed'`)
	execMigration(data, `UPDATE contact_data_bases SET status = 'pending'  WHERE status = 'pendiente'`)

	// ─────────────────────────────────────────────────────────────────────────
	// CHECK CONSTRAINTS: garantizar integridad de datos a nivel de base de datos
	// Se usan DO blocks para hacerlos idempotentes.
	// ─────────────────────────────────────────────────────────────────────────
	execMigration(data, `DO $$ BEGIN
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

	// ─────────────────────────────────────────────────────────────────────────
	// GRUPOS: índices y constraints
	// ─────────────────────────────────────────────────────────────────────────

	// Índice único parcial: evita que un mismo usuario sea miembro duplicado
	// de un grupo al mismo tiempo (pero permite soft-delete + re-unirse).
	execMigration(data, `CREATE UNIQUE INDEX IF NOT EXISTS idx_group_member_active
		ON group_members (group_id, user_id)
		WHERE deleted_at IS NULL`)

	// Índice compuesto para cargar el historial de mensajes de un grupo ordenado.
	execMigration(data, `CREATE INDEX IF NOT EXISTS idx_group_messages_history
		ON group_messages (group_id, created_at)
		WHERE deleted_at IS NULL`)

	// Índice para paginación por cursor (id < before ORDER BY id DESC) del historial.
	execMigration(data, `CREATE INDEX IF NOT EXISTS idx_group_messages_cursor
		ON group_messages (group_id, id)
		WHERE deleted_at IS NULL`)

	// Índice para lookup de miembros por grupo
	execMigration(data, `CREATE INDEX IF NOT EXISTS idx_group_members_group
		ON group_members (group_id)
		WHERE deleted_at IS NULL`)

	// CHECK constraints para garantizar integridad en las tablas nuevas
	execMigration(data, `DO $$ BEGIN
		-- group_members.role
		IF NOT EXISTS (
			SELECT 1 FROM information_schema.constraint_column_usage
			WHERE table_name = 'group_members' AND constraint_name = 'chk_group_members_role'
		) THEN
			ALTER TABLE group_members ADD CONSTRAINT chk_group_members_role
				CHECK (role IN ('admin', 'member'));
		END IF;

		-- group_messages.media_type (mismos valores que messages)
		IF NOT EXISTS (
			SELECT 1 FROM information_schema.constraint_column_usage
			WHERE table_name = 'group_messages' AND constraint_name = 'chk_group_messages_media_type'
		) THEN
			ALTER TABLE group_messages ADD CONSTRAINT chk_group_messages_media_type
				CHECK (media_type IS NULL OR media_type = ''
					OR media_type IN ('image', 'audio', 'video', 'sticker', 'document'));
		END IF;

		-- group_messages.kind ("" normal | "system" evento persistido)
		IF NOT EXISTS (
			SELECT 1 FROM information_schema.constraint_column_usage
			WHERE table_name = 'group_messages' AND constraint_name = 'chk_group_messages_kind'
		) THEN
			ALTER TABLE group_messages ADD CONSTRAINT chk_group_messages_kind
				CHECK (kind IN ('', 'system'));
		END IF;
	END $$;`)

	// ─────────────────────────────────────────────────────────────────────────
	// ESTADOS (stories): índices y constraints
	// ─────────────────────────────────────────────────────────────────────────

	// Índice único parcial: evita vistas duplicadas de un mismo espectador
	// sobre un mismo estado (idempotencia de "marcar como visto").
	execMigration(data, `CREATE UNIQUE INDEX IF NOT EXISTS idx_status_view_unique
		ON status_views (status_id, viewer_id)
		WHERE deleted_at IS NULL`)

	// Índice para el filtro de expiración (todas las lecturas de estados lo usan).
	execMigration(data, `CREATE INDEX IF NOT EXISTS idx_statuses_expires_at
		ON statuses (expires_at)
		WHERE deleted_at IS NULL`)

	// Índice para cargar los estados de una lista de dueños (feed), ordenados.
	execMigration(data, `CREATE INDEX IF NOT EXISTS idx_statuses_user_created
		ON statuses (user_id, created_at)
		WHERE deleted_at IS NULL`)

	execMigration(data, `DO $$ BEGIN
		-- statuses.type
		IF NOT EXISTS (
			SELECT 1 FROM information_schema.constraint_column_usage
			WHERE table_name = 'statuses' AND constraint_name = 'chk_statuses_type'
		) THEN
			ALTER TABLE statuses ADD CONSTRAINT chk_statuses_type
				CHECK (type IN ('text', 'image', 'video'));
		END IF;
	END $$;`)

	setupMessageSearch(data)

	log.Println("[DB] Conexión con PostgreSQL establecida")
	return data, nil
}

// setupMessageSearch prepara la búsqueda de mensajes: extensiones pg_trgm y
// unaccent, la función IMMUTABLE norm(text) = lower(unaccent(text)) y los
// índices GIN trigram parciales (solo mensajes de texto no borrados) sobre
// messages y group_messages. En hosts donde no se pueden crear las extensiones
// se omite todo y la capa de repos cae a ILIKE (ver repos/searchData.go).
func setupMessageSearch(data *gorm.DB) {
	for _, ext := range []string{"pg_trgm", "unaccent"} {
		if err := data.Exec("CREATE EXTENSION IF NOT EXISTS " + ext).Error; err != nil {
			log.Printf("[DB] Búsqueda de mensajes: extensión %s no disponible (%v); se usará ILIKE", ext, err)
			return
		}
	}
	// unaccent() es STABLE; el wrapper se declara IMMUTABLE (el diccionario es
	// fijo) para poder usarlo en índices de expresión.
	if err := data.Exec(`CREATE OR REPLACE FUNCTION norm(text) RETURNS text
		LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
		AS $$ SELECT lower(public.unaccent('public.unaccent'::regdictionary, $1)) $$`).Error; err != nil {
		log.Printf("[DB] Búsqueda de mensajes: no se pudo crear norm() (%v); se usará ILIKE", err)
		return
	}
	execMigration(data, `CREATE INDEX IF NOT EXISTS idx_messages_search_trgm
		ON messages USING gin (norm(message) gin_trgm_ops)
		WHERE deleted_at IS NULL AND COALESCE(media_type,'') = ''`)
	execMigration(data, `CREATE INDEX IF NOT EXISTS idx_group_messages_search_trgm
		ON group_messages USING gin (norm(message) gin_trgm_ops)
		WHERE deleted_at IS NULL AND COALESCE(media_type,'') = ''`)
}
