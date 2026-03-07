// cmd/migrate/main.go
//
// Standalone binary that connects to PostgreSQL and runs all pending migrations
// without starting the full application server.  Useful for:
//   - CI/CD pipelines (run before deploying new app version)
//   - Docker healthcheck / init-container patterns
//   - Manual DBA intervention
//
// Usage:
//
//	go run ./cmd/migrate
//	# or build once and run
//	go build -o bin/migrate ./cmd/migrate && ./bin/migrate
//
// Required environment variables (same as the main app):
//
//	POSTGRES_HOST, POSTGRES_PORT, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB
package main

import (
	"fmt"
	"gorm/backend/database"
	"gorm/backend/utils"
	"os"
)

func main() {
	utils.LoadEnv()

	fmt.Println("[migrate] Connecting to PostgreSQL...")

	db, err := database.Conection()
	if err != nil {
		fmt.Fprintf(os.Stderr, "[migrate] ERROR: %v\n", err)
		os.Exit(1)
	}

	sqlDB, err := db.DB()
	if err != nil {
		fmt.Fprintf(os.Stderr, "[migrate] ERROR: could not get sql.DB: %v\n", err)
		os.Exit(1)
	}
	defer sqlDB.Close()

	fmt.Println("[migrate] All migrations applied successfully.")
}
