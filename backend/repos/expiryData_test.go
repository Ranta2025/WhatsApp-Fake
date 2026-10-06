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

// stmtsOn devuelve las sentencias registradas que mencionan table.
func stmtsOn(rec *sqlRecorder, table string) []string {
	var out []string
	for _, s := range rec.all() {
		if strings.Contains(s, table) {
			out = append(out, s)
		}
	}
	return out
}

var expiryKinds = []struct {
	kind  string
	table string
	cols  string
}{
	{models.ReactionKindDirect, `"messages"`, "id_user"},
	{models.ReactionKindGroup, `"group_messages"`, "group_id"},
}

func TestSelectExpiredUsesDBClockUnscopedOrderedAndLocked(t *testing.T) {
	for _, k := range expiryKinds {
		t.Run(k.kind, func(t *testing.T) {
			db, rec := dryRunDB(t)
			_, err := selectExpired(db, k.kind, 500, true)
			require.NoError(t, err)

			stmts := stmtsOn(rec, k.table)
			require.Len(t, stmts, 1, rec.all())
			s := stmts[0]
			assert.Contains(t, s, "expires_at <= now()", "reloj de la BD, expires_at == now() ya venció")
			assert.NotContains(t, s, "expires_at < now()")
			assert.NotContains(t, s, "deleted_at", "Unscoped: incluye los borrados para todos (conservan el texto)")
			assert.Contains(t, s, "media_url")
			assert.Contains(t, s, k.cols)
			assert.Contains(t, s, "ORDER BY id")
			assert.Contains(t, s, "LIMIT 500")
			assert.Contains(t, s, "FOR UPDATE SKIP LOCKED")
		})
	}
}

func TestSelectExpiredWithoutLockForDryRun(t *testing.T) {
	db, rec := dryRunDB(t)
	_, err := selectExpired(db, models.ReactionKindDirect, 10, false)
	require.NoError(t, err)
	for _, s := range rec.all() {
		assert.NotContains(t, s, "FOR UPDATE")
	}
}

func TestCountExpiredUsesDBClockUnscoped(t *testing.T) {
	for _, k := range expiryKinds {
		t.Run(k.kind, func(t *testing.T) {
			db, rec := dryRunDB(t)
			_, _ = (&RepoExpiry{data: db}).CountExpired(context.Background(), k.kind)
			stmts := stmtsOn(rec, k.table)
			require.Len(t, stmts, 1, rec.all())
			assert.Contains(t, stmts[0], "count(")
			assert.Contains(t, stmts[0], "expires_at <= now()")
			assert.NotContains(t, stmts[0], "deleted_at")
		})
	}
}

func TestExpiryRejectsUnknownKind(t *testing.T) {
	db, rec := dryRunDB(t)
	_, err := selectExpired(db, "otro", 10, true)
	assert.Error(t, err)
	assert.Error(t, scrubReplies(db, "otro", []uint{1}))
	assert.Error(t, hardDeleteMessages(db, "otro", []uint{1}))
	assert.Error(t, deleteExpiredReactions(db, "otro", []uint{1}))
	assert.Empty(t, rec.all(), "un kind desconocido no genera SQL")
}

func TestScrubRepliesNullsTheCopiedQuote(t *testing.T) {
	for _, k := range expiryKinds {
		t.Run(k.kind, func(t *testing.T) {
			db, rec := dryRunDB(t)
			require.NoError(t, scrubReplies(db, k.kind, []uint{5, 6}))

			stmts := stmtsOn(rec, k.table)
			require.Len(t, stmts, 1, rec.all())
			s := stmts[0]
			assert.True(t, strings.HasPrefix(s, "UPDATE "+k.table), s)
			assert.Contains(t, s, `"reply_to_message"=NULL`)
			assert.Contains(t, s, `"reply_to_message_id"=NULL`)
			assert.Contains(t, s, `"reply_to_telephon"=NULL`)
			assert.Contains(t, s, "reply_to_message_id IN (5,6)")
			assert.NotContains(t, s, "deleted_at", "también las respuestas borradas para todos")
		})
	}
}

func TestDeleteExpiredReactionsFiltersByKind(t *testing.T) {
	for _, k := range expiryKinds {
		t.Run(k.kind, func(t *testing.T) {
			db, rec := dryRunDB(t)
			require.NoError(t, deleteExpiredReactions(db, k.kind, []uint{5, 6}))

			stmts := stmtsOn(rec, "message_reactions")
			require.Len(t, stmts, 1, rec.all())
			s := stmts[0]
			assert.True(t, strings.HasPrefix(s, `DELETE FROM "message_reactions"`), s)
			assert.Contains(t, s, "message_kind = '"+k.kind+"'")
			assert.Contains(t, s, "message_id IN (5,6)")
		})
	}
}

func TestHardDeleteMessagesByExplicitIDs(t *testing.T) {
	for _, k := range expiryKinds {
		t.Run(k.kind, func(t *testing.T) {
			db, rec := dryRunDB(t)
			require.NoError(t, hardDeleteMessages(db, k.kind, []uint{5, 6}))

			stmts := stmtsOn(rec, k.table)
			require.Len(t, stmts, 1, rec.all())
			s := stmts[0]
			assert.True(t, strings.HasPrefix(s, "DELETE FROM "+k.table), "borrado físico, no UPDATE deleted_at: %s", s)
			assert.Contains(t, s, "id IN (5,6)")
			assert.NotContains(t, s, "deleted_at")
			assert.NotContains(t, s, "expires_at", "se borra por la lista explícita, no por predicado")
		})
	}
}

func TestEmptyIDListsGenerateNoSQL(t *testing.T) {
	db, rec := dryRunDB(t)
	require.NoError(t, scrubReplies(db, models.ReactionKindDirect, nil))
	require.NoError(t, deleteExpiredReactions(db, models.ReactionKindDirect, nil))
	require.NoError(t, hardDeleteMessages(db, models.ReactionKindDirect, nil))
	require.NoError(t, enqueueMediaGC(db, nil))
	assert.Empty(t, rec.all())
}

func TestEnqueueMediaGCIdempotentWithDBClock(t *testing.T) {
	db, rec := dryRunDB(t)
	require.NoError(t, enqueueMediaGC(db, []string{"images/a.jpg", "images/b.jpg", "images/a.jpg"}))

	stmts := stmtsOn(rec, "media_gc")
	require.Len(t, stmts, 2, "una por key distinta: %v", rec.all())
	for _, s := range stmts {
		assert.True(t, strings.HasPrefix(s, "INSERT INTO media_gc"), s)
		assert.Contains(t, s, "now()")
		assert.Contains(t, s, "ON CONFLICT (object_key) DO NOTHING")
	}
	assert.Contains(t, stmts[0], "'images/a.jpg'")
	assert.Contains(t, stmts[1], "'images/b.jpg'")
}

func TestExpiredMediaKeys(t *testing.T) {
	keyOf := func(u string) (string, bool) {
		if strings.HasPrefix(u, "/storage/media/") {
			return strings.TrimPrefix(u, "/storage/media/"), true
		}
		return "", false
	}
	rows := []expiredRow{
		{ID: 1, MediaUrl: "/storage/media/images/a.jpg"},
		{ID: 2, MediaUrl: ""},
		{ID: 3, MediaUrl: "https://externo/x.jpg"},
		{ID: 4, MediaUrl: "/storage/media/images/a.jpg"},
		{ID: 5, MediaUrl: "/storage/media/audio/b.webm"},
	}
	assert.Equal(t, []string{"images/a.jpg", "audio/b.webm"}, expiredMediaKeys(rows, keyOf))
	assert.Empty(t, expiredMediaKeys(rows, nil), "sin derivación no se encola nada")
}

func TestDueMediaGCUsesDBClock(t *testing.T) {
	db, rec := dryRunDB(t)
	_, _ = (&RepoExpiry{data: db}).DueMediaGC(context.Background(), 50)
	stmts := stmtsOn(rec, "media_gc")
	require.Len(t, stmts, 1)
	assert.Contains(t, stmts[0], "next_attempt_at <= now()")
	assert.Contains(t, stmts[0], "LIMIT 50")
}

func TestMediaKeyReferencedChecksEveryLiveMediaColumn(t *testing.T) {
	db, rec := dryRunDB(t)
	_, _ = (&RepoExpiry{data: db}).MediaKeyReferenced(context.Background(), "images/a.jpg")
	all := strings.Join(rec.all(), "\n")
	for _, ref := range []string{
		"FROM messages WHERE deleted_at IS NULL AND right(media_url",
		"FROM group_messages WHERE deleted_at IS NULL AND right(media_url",
		"FROM statuses WHERE deleted_at IS NULL AND right(media_url",
		"FROM user_data_bases WHERE deleted_at IS NULL AND (right(avatar_url",
		"right(wallpaper_url",
		"FROM contact_data_bases WHERE deleted_at IS NULL AND right(wallpaper_url",
		"FROM groups WHERE deleted_at IS NULL AND right(avatar_url",
		// Biblioteca de stickers: un sticker propio vivo, un favorito o un
		// reciente impiden borrar el objeto (SF3).
		"FROM user_stickers WHERE deleted_at IS NULL AND right(url",
		"FROM sticker_favorites WHERE right(url",
		"FROM sticker_recents WHERE right(url",
	} {
		assert.Contains(t, all, ref)
	}
	assert.Contains(t, all, "'/images/a.jpg'", "sufijo exacto /key (keys xid únicas)")
	assert.NotContains(t, all, "LIKE", "sin comodines")
}

// RF12: las tres cláusulas de la biblioteca de stickers van OR-encadenadas
// dentro del mismo SELECT, así que CUALQUIER fila viva (propia, favorito o
// reciente) hace verdadera la comprobación. El unit es dryRun y no ejecuta SQL:
// pina la forma que garantiza la rama verdadera; las ramas reales se prueban en
// integration/sticker_race_test.go (TestE2EStickerLibraryReferencesProtectObject).
func TestMediaKeyReferencedStickerClausesAreOrEd(t *testing.T) {
	db, rec := dryRunDB(t)
	_, _ = (&RepoExpiry{data: db}).MediaKeyReferenced(context.Background(), "stickers/abc.webp")
	all := strings.Join(rec.all(), "\n")
	for _, clause := range []string{
		"OR EXISTS (SELECT 1 FROM user_stickers WHERE deleted_at IS NULL AND right(url",
		"OR EXISTS (SELECT 1 FROM sticker_favorites WHERE right(url",
		"OR EXISTS (SELECT 1 FROM sticker_recents WHERE right(url",
	} {
		assert.Contains(t, all, clause, "las referencias de stickers van OR-encadenadas")
	}
	assert.NotContains(t, all, "AND EXISTS (SELECT 1 FROM sticker_favorites", "no deben exigirse todas a la vez")
}

// EnqueueMediaGC expuesto para la biblioteca de stickers: idempotente y con
// clave vacía como no-op.
func TestEnqueueMediaGCExported(t *testing.T) {
	db, rec := dryRunDB(t)
	r := InitRepoExpiry(db)

	require.NoError(t, r.EnqueueMediaGC(context.Background(), "stickers/abc.webp"))
	stmts := stmtsOn(rec, "media_gc")
	require.Len(t, stmts, 1)
	assert.True(t, strings.HasPrefix(stmts[0], "INSERT INTO media_gc"), stmts[0])
	assert.Contains(t, stmts[0], "'stickers/abc.webp'")
	assert.Contains(t, stmts[0], "ON CONFLICT (object_key) DO NOTHING")

	require.NoError(t, r.EnqueueMediaGC(context.Background(), ""))
	assert.Len(t, stmtsOn(rec, "media_gc"), 1, "una key vacía no encola nada")
}

func TestMediaGCRowWrites(t *testing.T) {
	db, rec := dryRunDB(t)
	r := &RepoExpiry{data: db}
	require.NoError(t, r.RescheduleMediaGC(context.Background(), 7, 2, 2*time.Minute, strings.Repeat("x", 900)))
	require.NoError(t, r.DeleteMediaGC(context.Background(), 7))

	stmts := stmtsOn(rec, "media_gc")
	require.Len(t, stmts, 2, rec.all())
	assert.True(t, strings.HasPrefix(stmts[0], `UPDATE "media_gc"`), stmts[0])
	assert.Contains(t, stmts[0], `"attempts"=2`)
	assert.Contains(t, stmts[0], "id = 7")
	assert.Contains(t, stmts[0], `"next_attempt_at"=now() +`, "el siguiente intento se calcula con el reloj de la BD")
	assert.Contains(t, stmts[0], "make_interval(secs =>")
	assert.NotContains(t, stmts[0], strings.Repeat("x", 501), "last_error truncado al tamaño de la columna")
	assert.True(t, strings.HasPrefix(stmts[1], `DELETE FROM "media_gc"`), stmts[1])
	assert.Contains(t, stmts[1], "7")
}

func TestSweepOrphanRepliesNullsQuoteWhenTargetIsHardDeleted(t *testing.T) {
	for _, k := range expiryKinds {
		t.Run(k.kind, func(t *testing.T) {
			db, rec := dryRunDB(t)
			require.NoError(t, sweepOrphanReplies(db, k.kind))

			stmts := stmtsOn(rec, k.table)
			require.Len(t, stmts, 1, rec.all())
			s := stmts[0]
			assert.True(t, strings.HasPrefix(s, "UPDATE "+k.table), s)
			assert.Contains(t, s, `"reply_to_message"=NULL`)
			assert.Contains(t, s, `"reply_to_message_id"=NULL`)
			assert.Contains(t, s, `"reply_to_telephon"=NULL`)
			assert.Contains(t, s, "reply_to_message_id IS NOT NULL")
			assert.Contains(t, s, "created_at > now() - interval '15 minutes'", "acotado a la ventana reciente")
			assert.Contains(t, s, "NOT EXISTS (SELECT 1 FROM "+strings.Trim(k.table, `"`)+" t WHERE t.id = "+strings.Trim(k.table, `"`)+".reply_to_message_id)")
			assert.NotContains(t, s, "deleted_at", "soft-deleted siguen existiendo: no son huérfanos")
		})
	}
}

func TestSweepOrphanRepliesRejectsUnknownKind(t *testing.T) {
	db, rec := dryRunDB(t)
	assert.Error(t, sweepOrphanReplies(db, "otro"))
	assert.Empty(t, rec.all())
}
