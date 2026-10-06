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

var stickerNow = time.Date(2026, 10, 5, 12, 0, 0, 0, time.UTC)

// La creación es idempotente por (id_user, sha256) activo: primero busca la
// fila viva y solo inserta si no existe.
func TestStickerRepoCreateChecksOwnerSHAThenInserts(t *testing.T) {
	db, rec := dryRunDB(t)
	r := InitRepoSticker(db, nil)
	sha := strings.Repeat("a", 64)

	row, created, err := r.CreateSticker(&models.UserSticker{
		IdUser: 4, SHA256: sha, URL: "/storage/media/stickers/" + sha + ".webp",
	}, context.Background())
	require.NoError(t, err)
	assert.True(t, created)
	assert.Equal(t, uint(4), row.IdUser)

	stmts := rec.all()
	require.Len(t, stmts, 2, stmts)
	assert.Contains(t, stmts[0], `FROM "user_stickers"`)
	assert.Contains(t, stmts[0], `id_user = 4 AND sha256 = '`+sha+`'`)
	assert.Contains(t, stmts[0], `"deleted_at" IS NULL`)
	assert.Contains(t, stmts[1], `INSERT INTO "user_stickers"`)
	assert.Contains(t, stmts[1], `"sha256"`)
}

func TestStickerRepoGetBySHANotFoundIsDomainError(t *testing.T) {
	db, _ := dryRunDB(t)
	r := InitRepoSticker(db, nil)
	_, err := r.GetStickerBySHA(1, strings.Repeat("b", 64), context.Background())
	assert.ErrorIs(t, err, models.ErrStickerNotFound)
}

func TestStickerRepoSoftDeleteScopedToOwner(t *testing.T) {
	db, rec := dryRunDB(t)
	r := InitRepoSticker(db, nil)

	found, err := r.SoftDeleteSticker(4, 9, context.Background())
	require.NoError(t, err)
	assert.False(t, found) // en DryRun no borra filas

	s := pushStmt(t, rec)
	assert.Contains(t, s, `UPDATE "user_stickers" SET "deleted_at"=`)
	assert.Contains(t, s, `id_user = 4 AND id = 9`)
}

func TestStickerRepoListMineScopedAndCapped(t *testing.T) {
	db, rec := dryRunDB(t)
	r := InitRepoSticker(db, nil)
	_, err := r.ListStickers(3, models.MaxUserStickers, context.Background())
	require.NoError(t, err)

	s := pushStmt(t, rec)
	assert.Contains(t, s, `FROM "user_stickers" WHERE id_user = 3`)
	assert.Contains(t, s, `"deleted_at" IS NULL`)
	assert.Contains(t, s, `LIMIT 200`)
}

func TestStickerRepoCountScoped(t *testing.T) {
	db, rec := dryRunDB(t)
	r := InitRepoSticker(db, nil)
	_, err := r.CountStickers(3, context.Background())
	require.NoError(t, err)

	s := pushStmt(t, rec)
	assert.Contains(t, s, `count(*)`)
	assert.Contains(t, s, `FROM "user_stickers" WHERE id_user = 3`)
}

// Los favoritos cubren stickers integrados y propios: unique (owner, url).
func TestStickerRepoUpsertFavoriteConflictDoNothing(t *testing.T) {
	db, rec := dryRunDB(t)
	r := InitRepoSticker(db, nil)
	require.NoError(t, r.UpsertFavorite(&models.StickerFavorite{IdUser: 2, URL: "/stickers/basic/hola.webp"}, context.Background()))

	s := pushStmt(t, rec)
	assert.Contains(t, s, `INSERT INTO "sticker_favorites"`)
	assert.Contains(t, s, `ON CONFLICT ("id_user","url") DO NOTHING`)
}

func TestStickerRepoDeleteFavoriteScopedToOwnerAndURL(t *testing.T) {
	db, rec := dryRunDB(t)
	r := InitRepoSticker(db, nil)
	require.NoError(t, r.DeleteFavorite(2, "/stickers/basic/hola.webp", context.Background()))

	s := pushStmt(t, rec)
	assert.Contains(t, s, `DELETE FROM "sticker_favorites"`)
	assert.Contains(t, s, `id_user = 2 AND url = '/stickers/basic/hola.webp'`)
}

func TestStickerRepoListFavoritesCapped(t *testing.T) {
	db, rec := dryRunDB(t)
	r := InitRepoSticker(db, nil)
	_, err := r.ListFavorites(2, models.MaxStickerFavorites, context.Background())
	require.NoError(t, err)

	s := pushStmt(t, rec)
	assert.Contains(t, s, `FROM "sticker_favorites" WHERE id_user = 2`)
	assert.Contains(t, s, `LIMIT 100`)
}

// Recientes: upsert por (owner, url) y recorte a 30 por usuario.
func TestStickerRepoUpsertRecentTrimsTo30(t *testing.T) {
	db, rec := dryRunDB(t)
	r := InitRepoSticker(db, nil)
	require.NoError(t, r.UpsertRecent(5, "/storage/media/stickers/x.webp", stickerNow, context.Background()))

	stmts := rec.all()
	require.Len(t, stmts, 2, stmts)
	assert.Contains(t, stmts[0], `INSERT INTO "sticker_recents"`)
	assert.Contains(t, stmts[0], `ON CONFLICT ("id_user","url") DO UPDATE SET`)
	assert.Contains(t, stmts[0], `"last_used_at"="excluded"."last_used_at"`)
	assert.Contains(t, stmts[1], `DELETE FROM "sticker_recents"`)
	assert.Contains(t, stmts[1], `id NOT IN`)
	assert.Contains(t, stmts[1], `LIMIT 30`)
}

func TestStickerRepoListRecentsCapped(t *testing.T) {
	db, rec := dryRunDB(t)
	r := InitRepoSticker(db, nil)
	_, err := r.ListRecents(5, models.StickerRecentsMax, context.Background())
	require.NoError(t, err)

	s := pushStmt(t, rec)
	assert.Contains(t, s, `FROM "sticker_recents" WHERE id_user = 5`)
	assert.Contains(t, s, `ORDER BY last_used_at DESC, id DESC`)
	assert.Contains(t, s, `LIMIT 30`)
}

func TestStickerRepoGetIdDelegates(t *testing.T) {
	db, _ := dryRunDB(t)
	r := InitRepoSticker(db, stubIDResolver{id: 11})
	id, err := r.GetIdByTelephon("+51999", context.Background())
	require.NoError(t, err)
	assert.Equal(t, 11, id)
}
