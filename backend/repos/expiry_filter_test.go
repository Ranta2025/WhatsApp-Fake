package repos

import (
	"context"
	"strings"
	"sync"
	"testing"
	"time"

	"gorm/backend/models"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// sqlRecorder es un logger de gorm que guarda cada sentencia generada. Con
// DryRun no se ejecuta nada (ni hace falta una base de datos), pero gorm sí
// construye y registra el SQL de cada consulta.
type sqlRecorder struct {
	mu   sync.Mutex
	stmt []string
}

func (r *sqlRecorder) LogMode(logger.LogLevel) logger.Interface      { return r }
func (r *sqlRecorder) Info(context.Context, string, ...interface{})  {}
func (r *sqlRecorder) Warn(context.Context, string, ...interface{})  {}
func (r *sqlRecorder) Error(context.Context, string, ...interface{}) {}
func (r *sqlRecorder) Trace(_ context.Context, _ time.Time, fc func() (string, int64), _ error) {
	sql, _ := fc()
	r.mu.Lock()
	r.stmt = append(r.stmt, sql)
	r.mu.Unlock()
}

func (r *sqlRecorder) all() []string {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]string(nil), r.stmt...)
}

func dryRunDB(t *testing.T) (*gorm.DB, *sqlRecorder) {
	t.Helper()
	rec := &sqlRecorder{}
	db, err := gorm.Open(postgres.New(postgres.Config{DSN: "host=127.0.0.1 port=1 user=x dbname=x sslmode=disable"}),
		&gorm.Config{DryRun: true, DisableAutomaticPing: true, Logger: rec, SkipDefaultTransaction: true})
	require.NoError(t, err)
	return db, rec
}

// expiredOperator es la parte del predicado que hay que preservar: estrictamente
// mayor que now() (un mensaje con expires_at == now() ya está expirado).
const expiredOperator = "expires_at > now()"

func TestNotExpiredPredicateShape(t *testing.T) {
	assert.Equal(t, "(expires_at IS NULL OR expires_at > now())", notExpiredFilter)
	assert.Equal(t, "(m.expires_at IS NULL OR m.expires_at > now())", notExpiredOn("m"))
	for _, p := range []string{notExpiredFilter, notExpiredOn("m")} {
		assert.NotContains(t, p, ">=", "expires_at == now() debe contar como expirado")
		assert.NotContains(t, p, "<")
	}
}

// requireNotExpired exige que al menos una sentencia sobre table lleve el
// predicado estricto. Los métodos "buscar y luego escribir por pk" (borrar para
// mí/para todos) filtran en la búsqueda, que es la que decide; la escritura por
// clave primaria posterior no repite el predicado.
func requireNotExpired(t *testing.T, rec *sqlRecorder, table string, qualified bool) {
	t.Helper()
	want := expiredOperator
	if qualified {
		want = ".expires_at > now()"
	}
	found := false
	for _, s := range rec.all() {
		if !strings.Contains(s, table) {
			continue
		}
		assert.NotContains(t, s, "expires_at >= now()")
		if strings.Contains(s, "expires_at IS NULL") && strings.Contains(s, want) {
			found = true
		}
	}
	assert.True(t, found, "ninguna sentencia sobre %s filtra expirados: %v", table, rec.all())
}

func TestReadPathsExcludeExpiredMessages(t *testing.T) {
	ctx := context.Background()
	// La sonda de norm() ejecutaría SQL; se fija el resultado y se restaura.
	prev := searchNorm
	searchNorm = &normDetector{decided: true, ok: false}
	t.Cleanup(func() { searchNorm = prev })

	cases := []struct {
		name      string
		table     string
		qualified bool
		run       func(db *gorm.DB)
	}{
		// 1:1 (contactData.go)
		{"GetMessagesPage", "messages", false, func(db *gorm.DB) { _, _, _ = (&ApiContact{data: db}).GetMessagesPage(1, 2, 0, 10, ctx) }},
		{"GetMessages", "messages", false, func(db *gorm.DB) { _, _ = (&ApiContact{data: db}).GetMessages(1, 2, ctx) }},
		{"visibleConversation", "messages", false, func(db *gorm.DB) {
			var m []models.Message
			(&ApiContact{data: db}).visibleConversation(ctx, 1, 2).Find(&m)
		}},
		{"GetMessagesAround", "messages", false, func(db *gorm.DB) { _, _, _, _ = (&ApiContact{data: db}).GetMessagesAround(1, 2, 5, 10, ctx) }},
		{"GetMessagesAfter", "messages", false, func(db *gorm.DB) { _, _, _ = (&ApiContact{data: db}).GetMessagesAfter(1, 2, 5, 10, ctx) }},
		{"GetSenderTelephonsWithPendingMessages", "messages", true, func(db *gorm.DB) { _, _ = (&ApiContact{data: db}).GetSenderTelephonsWithPendingMessages(1, ctx) }},
		{"GetRecentMessagesForUser", "messages", true, func(db *gorm.DB) { _, _ = (&ApiContact{data: db}).GetRecentMessagesForUser(1, 5, ctx) }},
		{"UpdateMessageContent", "messages", false, func(db *gorm.DB) { _ = (&ApiContact{data: db}).UpdateMessageContent(5, 1, "x", ctx) }},
		{"GetMessageByID", "messages", false, func(db *gorm.DB) { _, _ = (&ApiContact{data: db}).GetMessageByID(5, ctx) }},
		{"DeleteMessageForSender", "messages", false, func(db *gorm.DB) { _, _ = (&ApiContact{data: db}).DeleteMessageForSender(5, 1, ctx) }},
		{"DeleteMessageForMe", "messages", false, func(db *gorm.DB) { _, _ = (&ApiContact{data: db}).DeleteMessageForMe(5, 1, ctx) }},
		// grupos (groupData.go)
		{"GetGroupMessages", "group_messages", false, func(db *gorm.DB) { _, _ = (&RepoGroup{data: db}).GetGroupMessages(9, 10, 0, ctx) }},
		{"GetGroupMessagesPage", "group_messages", false, func(db *gorm.DB) { _, _, _ = (&RepoGroup{data: db}).GetGroupMessagesPage(9, 0, 10, 0, ctx) }},
		{"GetGroupMessagesAround", "group_messages", false, func(db *gorm.DB) { _, _, _, _ = (&RepoGroup{data: db}).GetGroupMessagesAround(9, 5, 10, ctx) }},
		{"GetGroupMessagesAfter", "group_messages", false, func(db *gorm.DB) { _, _, _ = (&RepoGroup{data: db}).GetGroupMessagesAfter(9, 5, 10, ctx) }},
		{"GetGroupMessageByID", "group_messages", false, func(db *gorm.DB) { _, _ = (&RepoGroup{data: db}).GetGroupMessageByID(5, ctx) }},
		{"EditGroupMessage", "group_messages", false, func(db *gorm.DB) { _ = (&RepoGroup{data: db}).EditGroupMessage(9, 5, 1, "x", ctx) }},
		{"DeleteGroupMessage", "group_messages", false, func(db *gorm.DB) { _ = (&RepoGroup{data: db}).DeleteGroupMessage(9, 5, 1, ctx) }},
		// búsqueda (searchData.go)
		{"SearchMessages", "messages", false, func(db *gorm.DB) { _, _, _ = (&ApiContact{data: db}).SearchMessages(1, 2, "hola", 0, 10, ctx) }},
		{"SearchGroupMessages", "group_messages", false, func(db *gorm.DB) { _, _, _ = (&RepoGroup{data: db}).SearchGroupMessages(9, 1, "hola", 0, 10, ctx) }},
		{"SearchMessagesGlobal", "messages", false, func(db *gorm.DB) { _, _ = (&ApiContact{data: db}).SearchMessagesGlobal(1, "hola", 3, 5, ctx) }},
		{"SearchGroupMessagesGlobal", "group_messages", false, func(db *gorm.DB) { _, _ = (&RepoGroup{data: db}).SearchGroupMessagesGlobal(1, "hola", 3, 5, ctx) }},
		// reacciones (reactionData.go)
		{"DirectMessageTarget", "messages", false, func(db *gorm.DB) { _, _ = (&RepoReaction{data: db}).DirectMessageTarget(5, 1, ctx) }},
		{"GroupMessageTarget", "group_messages", false, func(db *gorm.DB) { _, _ = (&RepoReaction{data: db}).GroupMessageTarget(9, 5, ctx) }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			db, rec := dryRunDB(t)
			tc.run(db)
			requireNotExpired(t, rec, tc.table, tc.qualified)
		})
	}
}

// TestGlobalSearchBuildersExcludeExpired fija los dos SQL de búsqueda global
// (con y sin norm()) sin pasar por gorm.
func TestGlobalSearchBuildersExcludeExpired(t *testing.T) {
	for _, useNorm := range []bool{true, false} {
		assert.Contains(t, directGlobalSearchSQL(useNorm), notExpiredFilter)
		assert.Contains(t, buildGlobalSearchSQL("group_messages", "group_id", groupSearchMembership, useNorm), notExpiredFilter)
	}
	assert.Contains(t, directSearchVisibleText, notExpiredFilter)
	assert.Contains(t, groupSearchVisibleText, notExpiredFilter)
}
