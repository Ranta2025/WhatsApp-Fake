package repos

import (
	"context"
	"strings"
	"testing"
	"time"

	"gorm/backend/models"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// stubIDResolver resuelve teléfonos sin tocar Redis/BD.
type stubIDResolver struct{ id int }

func (s stubIDResolver) GetIdByTelephon(string, context.Context) (int, error) { return s.id, nil }

func pushStmt(t *testing.T, rec *sqlRecorder) string {
	t.Helper()
	stmts := rec.all()
	require.Len(t, stmts, 1, stmts)
	return stmts[0]
}

func TestPushRepoGetIdDelegates(t *testing.T) {
	db, _ := dryRunDB(t)
	r := InitRepoPush(db, stubIDResolver{id: 7})
	id, err := r.GetIdByTelephon("+51999", context.Background())
	require.NoError(t, err)
	assert.Equal(t, 7, id)
}

func TestPushRepoUpsertReassignsByEndpoint(t *testing.T) {
	db, rec := dryRunDB(t)
	r := InitRepoPush(db, nil)
	sub := &models.PushSubscription{UserID: 3, Endpoint: "https://fcm.googleapis.com/x", P256dh: "p", Auth: "a", UserAgent: "ua"}
	require.NoError(t, r.UpsertSubscription(sub, context.Background()))

	s := pushStmt(t, rec)
	assert.Contains(t, s, `INSERT INTO "push_subscriptions"`)
	assert.Contains(t, s, `ON CONFLICT ("endpoint") DO UPDATE SET`)
	for _, col := range []string{`"user_id"="excluded"."user_id"`, `"p256dh"="excluded"."p256dh"`, `"auth"="excluded"."auth"`, `"user_agent"="excluded"."user_agent"`} {
		assert.Contains(t, s, col)
	}
	assert.NotContains(t, s, `"created_at"="excluded"`, "created_at se conserva")
}

func TestPushRepoListAndCountByUser(t *testing.T) {
	db, rec := dryRunDB(t)
	r := InitRepoPush(db, nil)
	_, err := r.ListSubscriptionsByUser(5, context.Background())
	require.NoError(t, err)
	s := pushStmt(t, rec)
	assert.Contains(t, s, `FROM "push_subscriptions" WHERE user_id = 5`)
	assert.Contains(t, s, "ORDER BY id")

	db, rec = dryRunDB(t)
	r = InitRepoPush(db, nil)
	_, err = r.CountSubscriptionsByUser(5, context.Background())
	require.NoError(t, err)
	s = pushStmt(t, rec)
	assert.Contains(t, s, "SELECT count(*)")
	assert.Contains(t, s, "user_id = 5")
}

func TestPushRepoDeleteByEndpointIsScopedToOwner(t *testing.T) {
	db, rec := dryRunDB(t)
	r := InitRepoPush(db, nil)
	require.NoError(t, r.DeleteSubscriptionByEndpoint(9, "https://fcm.googleapis.com/x", context.Background()))
	s := pushStmt(t, rec)
	assert.Contains(t, s, `DELETE FROM "push_subscriptions"`)
	assert.Contains(t, s, "user_id = 9")
	assert.Contains(t, s, "endpoint = 'https://fcm.googleapis.com/x'")
	assert.NotContains(t, s, "deleted_at", "sin soft delete")
}

func TestPushRepoDeleteByIDAndMarkSuccess(t *testing.T) {
	db, rec := dryRunDB(t)
	r := InitRepoPush(db, nil)
	require.NoError(t, r.DeleteSubscriptionByID(4, context.Background()))
	s := pushStmt(t, rec)
	assert.Contains(t, s, `DELETE FROM "push_subscriptions" WHERE id = 4`)

	db, rec = dryRunDB(t)
	r = InitRepoPush(db, nil)
	require.NoError(t, r.MarkSubscriptionSuccess(4, time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC), context.Background()))
	s = pushStmt(t, rec)
	assert.Contains(t, s, `UPDATE "push_subscriptions" SET "last_success_at"=`)
	assert.Contains(t, s, "id = 4")
}

func TestPushRepoPreviewDisabledGetSet(t *testing.T) {
	db, rec := dryRunDB(t)
	r := InitRepoPush(db, nil)
	_, err := r.GetPushPreviewDisabled(2, context.Background())
	require.NoError(t, err)
	s := pushStmt(t, rec)
	assert.Contains(t, s, `SELECT "push_preview_disabled" FROM "user_data_bases"`)
	assert.Contains(t, s, "id = 2")

	db, rec = dryRunDB(t)
	r = InitRepoPush(db, nil)
	require.NoError(t, r.SetPushPreviewDisabled(2, true, context.Background()))
	s = pushStmt(t, rec)
	assert.True(t, strings.HasPrefix(s, `UPDATE "user_data_bases" SET "push_preview_disabled"=true`), s)
	assert.Contains(t, s, "id = 2")
}

func TestPushRepoListTargetsByTelephonsJoinsActiveUsers(t *testing.T) {
	db, rec := dryRunDB(t)
	r := InitRepoPush(db, nil)
	_, err := r.ListPushTargetsByTelephons([]string{"+1", "+2"}, context.Background())
	require.NoError(t, err)
	s := pushStmt(t, rec)
	assert.Contains(t, s, `push_subscriptions.*`)
	assert.Contains(t, s, `u.telephon`)
	assert.Contains(t, s, `u.push_preview_disabled`)
	assert.Contains(t, s, `JOIN user_data_bases u ON u.id = push_subscriptions.user_id AND u.deleted_at IS NULL`)
	assert.Contains(t, s, `u.telephon IN ('+1','+2')`)
	assert.Contains(t, s, "ORDER BY push_subscriptions.id")
}

func TestPushRepoListTargetsByTelephonsEmptySkipsQuery(t *testing.T) {
	db, rec := dryRunDB(t)
	r := InitRepoPush(db, nil)
	targets, err := r.ListPushTargetsByTelephons(nil, context.Background())
	require.NoError(t, err)
	assert.Empty(t, targets)
	assert.Empty(t, rec.all())
}
