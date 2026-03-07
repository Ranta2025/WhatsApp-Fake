package database

import (
	"embed"
	"fmt"
	"io/fs"
	"sort"
	"strings"
	"time"

	"gorm.io/gorm"
)

// migrationFiles embeds all SQL files from the migrations directory into the binary,
// so the app can deploy as a single artifact without carrying external SQL files.
//
//go:embed migrations/*.sql
var migrationFiles embed.FS

// schemaMigration tracks every applied migration in the database.
// The table is created automatically before any migration runs.
type schemaMigration struct {
	Version   string    `gorm:"column:version;primaryKey"`
	AppliedAt time.Time `gorm:"column:applied_at;autoCreateTime"`
}

func (schemaMigration) TableName() string { return "schema_migrations" }

// RunPreMigrations executes all SQL files whose name starts with "pre_", in
// ascending alphabetical order.  These must run BEFORE GORM AutoMigrate so
// that legacy column renames do not conflict with newly added columns.
func RunPreMigrations(db *gorm.DB) error {
	return runMigrations(db, "pre_")
}

// RunPostMigrations executes all SQL files whose name starts with "post_", in
// ascending alphabetical order.  These run AFTER GORM AutoMigrate to apply
// indexes, constraints and data-normalization patches.
func RunPostMigrations(db *gorm.DB) error {
	return runMigrations(db, "post_")
}

// ensureMigrationsTable creates the schema_migrations tracking table if it does
// not already exist.  We use raw SQL (not AutoMigrate) to avoid a bootstrap
// dependency on any migration being applied first.
func ensureMigrationsTable(db *gorm.DB) error {
	return db.Exec(`
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version    TEXT        PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`).Error
}

// runMigrations filters migration files by prefix, sorts them, and applies only
// those not yet recorded in schema_migrations — making the process idempotent.
func runMigrations(db *gorm.DB, prefix string) error {
	if err := ensureMigrationsTable(db); err != nil {
		return fmt.Errorf("migration: could not create tracking table: %w", err)
	}

	files, err := listMigrationFiles(prefix)
	if err != nil {
		return err
	}

	for _, name := range files {
		version := strings.TrimSuffix(name, ".sql")

		if applied, err := isMigrationApplied(db, version); err != nil {
			return err
		} else if applied {
			continue
		}

		if err := executeMigrationFile(db, name); err != nil {
			return fmt.Errorf("migration %s failed: %w", name, err)
		}

		if err := recordMigration(db, version); err != nil {
			return err
		}

		fmt.Printf("[migrations] applied: %s\n", name)
	}

	return nil
}

// listMigrationFiles returns embedded SQL file names that match the given
// prefix, sorted in ascending order to guarantee deterministic execution.
func listMigrationFiles(prefix string) ([]string, error) {
	entries, err := fs.ReadDir(migrationFiles, "migrations")
	if err != nil {
		return nil, fmt.Errorf("migration: cannot read migrations directory: %w", err)
	}

	var names []string
	for _, e := range entries {
		if !e.IsDir() &&
			strings.HasPrefix(e.Name(), prefix) &&
			strings.HasSuffix(e.Name(), ".sql") {
			names = append(names, e.Name())
		}
	}

	sort.Strings(names)
	return names, nil
}

// isMigrationApplied reports whether a migration version has already been
// recorded in the schema_migrations table.
func isMigrationApplied(db *gorm.DB, version string) (bool, error) {
	var count int64
	if err := db.Model(&schemaMigration{}).
		Where("version = ?", version).
		Count(&count).Error; err != nil {
		return false, fmt.Errorf("migration: checking version %q: %w", version, err)
	}
	return count > 0, nil
}

// executeMigrationFile reads an embedded SQL file and executes its content
// against the database in a single Exec call.
func executeMigrationFile(db *gorm.DB, name string) error {
	content, err := migrationFiles.ReadFile("migrations/" + name)
	if err != nil {
		return fmt.Errorf("migration: reading file %q: %w", name, err)
	}
	return db.Exec(string(content)).Error
}

// recordMigration inserts a row into schema_migrations to mark a version as applied.
func recordMigration(db *gorm.DB, version string) error {
	row := schemaMigration{Version: version, AppliedAt: time.Now()}
	if err := db.Create(&row).Error; err != nil {
		return fmt.Errorf("migration: recording version %q: %w", version, err)
	}
	return nil
}
