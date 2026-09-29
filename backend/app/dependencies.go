package app

import (
	"context"
	"gorm/backend/metrics"
	"log/slog"
	"time"

	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

const (
	// dependencyCheckInterval es cada cuánto se refresca dependency_up.
	dependencyCheckInterval = 15 * time.Second
	// dependencyCheckTimeout acota cada chequeo para no colgar el checker.
	dependencyCheckTimeout = 2 * time.Second
)

// dependencyCheck devuelve la disponibilidad de PostgreSQL y Redis.
type dependencyCheck func(ctx context.Context) (postgresOK, redisOK bool)

// checkDependencies hace ping a PostgreSQL y Redis. Lo comparten /healthz y el
// checker en segundo plano que alimenta dependency_up.
func checkDependencies(ctx context.Context, db *gorm.DB, rd *redis.Client) (postgresOK, redisOK bool) {
	if sqlDB, err := db.DB(); err == nil && sqlDB.PingContext(ctx) == nil {
		postgresOK = true
	}
	redisOK = rd.Ping(ctx).Err() == nil
	return postgresOK, redisOK
}

// runDependencyCheck ejecuta un chequeo con timeout y lo refleja en dependency_up.
func runDependencyCheck(ctx context.Context, m *metrics.Metrics, check dependencyCheck, timeout time.Duration) {
	checkCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	postgresOK, redisOK := check(checkCtx)
	m.SetDependencyUp("postgres", postgresOK)
	m.SetDependencyUp("redis", redisOK)
}

// dependencyCheckLoop chequea al arrancar (sin esperar al primer tick) y luego
// en cada tick, hasta que ctx se cancela.
func dependencyCheckLoop(ctx context.Context, m *metrics.Metrics, check dependencyCheck, interval, timeout time.Duration) {
	runDependencyCheck(ctx, m, check, timeout)

	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			runDependencyCheck(ctx, m, check, timeout)
		}
	}
}

// registerRuntimeMetrics conecta los gauges que se leen en cada scrape: Hub
// WebSocket, pool de PostgreSQL y pool de Redis. Un fallo de registro se
// loguea pero no impide arrancar (las métricas no son críticas).
func registerRuntimeMetrics(m *metrics.Metrics, hub interface{ Stats() metrics.HubStats }, db *gorm.DB, rd *redis.Client) {
	if err := m.RegisterHubStats(hub.Stats); err != nil {
		logMetricsError("hub", err)
	}
	if sqlDB, err := db.DB(); err == nil {
		if err := m.RegisterDBStats(sqlDB, "postgres"); err != nil {
			logMetricsError("postgres", err)
		}
	}
	if err := m.RegisterRedisPoolStats(func() *redis.PoolStats { return rd.PoolStats() }); err != nil {
		logMetricsError("redis", err)
	}
}

func logMetricsError(source string, err error) {
	slog.Error("no se pudo registrar métricas", "source", source, "err", err)
}
