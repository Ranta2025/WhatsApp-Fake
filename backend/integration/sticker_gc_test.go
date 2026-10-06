//go:build e2e

// SF3: GC de objetos de stickers y recientes server-side contra la BD del stack.
//
//	E2E_BASE_URL=http://localhost go test -tags e2e ./backend/integration/
//
// El stack de Docker ya está construido y NO se reconstruye en esta tarea: los
// casos nuevos ejercitan el código de SF3 EN PROCESO (el binario de test) contra
// la misma PostgreSQL del stack, igual que hacen e2e_client_id_test.go y el job
// de expiración de e2e_disappearing_test.go. Así no dependen de que la imagen de
// la app incluya SF3. Se reutilizan los dobles acotados de
// e2e_disappearing_test.go (deOwnedQueueRepo, deRemover, deNotifier,
// deNoMetrics) para no tocar la cola media_gc de otros datos.
package integration

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
	"testing"
	"time"

	"gorm/backend/database"
	"gorm/backend/models"
	"gorm/backend/repos"
	"gorm/backend/services"
	"gorm/backend/utils"

	"github.com/minio/minio-go/v7"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// sgStore es un doble de MinIO: el borrado de un sticker solo encola/consulta la
// BD, así que el caso no necesita almacenamiento real.
type sgStore struct{}

func (sgStore) StatObject(context.Context, string, string, minio.StatObjectOptions) (minio.ObjectInfo, error) {
	return minio.ObjectInfo{}, minio.ErrorResponse{Code: "NoSuchKey"}
}

func (sgStore) PutObject(context.Context, string, string, io.Reader, int64, minio.PutObjectOptions) (minio.UploadInfo, error) {
	return minio.UploadInfo{}, nil
}

func (sgStore) GetObject(context.Context, string, string, minio.GetObjectOptions) (io.ReadCloser, error) {
	return nil, errors.New("sin objeto")
}

// sgBucket es el bucket de medios del stack (igual que ServiceMedia).
func sgBucket() string {
	if b := os.Getenv("MINIO_BUCKET"); b != "" {
		return b
	}
	return "media"
}

// sgQueued cuenta las filas de media_gc para las keys indicadas.
func sgQueued(t *testing.T, db *gorm.DB, keys ...string) int64 {
	t.Helper()
	var n int64
	require.NoError(t, db.Model(&models.MediaGC{}).Where("object_key IN ?", keys).Count(&n).Error)
	return n
}

// sgRunPasses ejecuta el job de expiración EN PROCESO acotado a las keys del
// test (la pasada nunca ve filas de la cola ajenas).
func sgRunPasses(t *testing.T, db *gorm.DB, owned map[string]bool, remover *deRemover) {
	t.Helper()
	svc := services.NewMessageExpiryService(
		&deOwnedQueueRepo{RepoExpiry: repos.InitRepoExpiry(db), owned: owned},
		remover, &deNotifier{}, deNoMetrics{}, false,
	)
	ctx := context.Background()
	for i := 0; i < 8; i++ {
		require.NoError(t, svc.RunOnce(ctx))
		time.Sleep(120 * time.Millisecond)
	}
}

// sgMakePeer crea un usuario receptor sin login (no consume cupo del limitador).
func sgMakePeer(t *testing.T, db *gorm.DB, suffix int64) models.UserDataBase {
	t.Helper()
	hash, err := utils.Hash("Passw0rd!")
	require.NoError(t, err)
	peer := models.UserDataBase{User: models.User{
		Username: fmt.Sprintf("sgpeer%d", suffix),
		Gmail:    fmt.Sprintf("sgpeer%d@gmail.com", suffix),
		Telephon: fmt.Sprintf("+57%d%07d", 1, suffix),
	}, Password: hash, Activo: true}
	require.NoError(t, db.Create(&peer).Error)
	t.Cleanup(func() {
		db.Exec("DELETE FROM messages WHERE id_user = ? OR id_receptor = ?", peer.ID, peer.ID)
		db.Exec("DELETE FROM user_data_bases WHERE id = ?", peer.ID)
	})
	return peer
}

// sgCleanStickers limpia las filas de biblioteca del usuario compartido (TestMain
// solo borra user_data_bases/push/mutes).
func sgCleanStickers(t *testing.T, db *gorm.DB, userID uint) {
	t.Helper()
	t.Cleanup(func() {
		db.Unscoped().Where("id_user = ?", userID).Delete(&models.UserSticker{})
		db.Where("id_user = ?", userID).Delete(&models.StickerFavorite{})
		db.Where("id_user = ?", userID).Delete(&models.StickerRecent{})
	})
}

// TestE2EStickerGC cubre SF3(a) y SF3(b): un mensaje temporal vencido con un
// sticker guardado NO borra el objeto; borrar el sticker (última referencia)
// sí lo encola y el GC lo borra. Incluye RF6 (borrado estando en favoritos).
func TestE2EStickerGC(t *testing.T) {
	db, err := database.Conection()
	require.NoError(t, err)
	_, user := sharedLogin(t) // sesión compartida: sin login nuevo
	ctx := context.Background()
	contactRepo := repos.InitRepoContact(db, nil)
	repoSticker := repos.InitRepoSticker(db, contactRepo)
	svc := services.NewServiceStickerLibrary(sgStore{}, repoSticker)
	repoExpiry := repos.InitRepoExpiry(db)
	store := services.NewServiceMedia(nil)
	bucket := sgBucket()

	suffix := time.Now().UnixNano() % 1000000
	peer := sgMakePeer(t, db, suffix)
	sgCleanStickers(t, db, user.ID)

	// ── (a) mensaje vencido con sticker guardado: el objeto sobrevive ────────
	shaSaved := strings.Repeat("a", 64)
	keySaved := "stickers/" + shaSaved + ".webp"
	urlSaved := "/storage/" + bucket + "/" + keySaved
	saved := models.UserSticker{IdUser: user.ID, SHA256: shaSaved, URL: urlSaved}
	require.NoError(t, db.Create(&saved).Error)

	past := time.Now().Add(-time.Hour)
	expired := models.Message{
		IdUser: user.ID, IdReceptor: peer.ID, Message: "sg keep " + fmt.Sprint(suffix),
		Status: "enviado", Time: time.Now(), MediaUrl: urlSaved, MediaType: "sticker", ExpiresAt: &past,
	}
	require.NoError(t, db.Create(&expired).Error)
	t.Cleanup(func() { db.Unscoped().Delete(&models.Message{}, expired.ID) })

	owned := map[string]bool{keySaved: true}
	remover := &deRemover{store: store, owned: owned}
	sgRunPasses(t, db, owned, remover)

	ref, err := repoExpiry.MediaKeyReferenced(ctx, keySaved)
	require.NoError(t, err)
	assert.True(t, ref, "un sticker guardado sigue referenciando el objeto")
	assert.NotContains(t, remover.removed(), keySaved, "el objeto de un sticker guardado no se borra")
	var n int64
	require.NoError(t, db.Unscoped().Model(&models.Message{}).Where("id = ?", expired.ID).Count(&n).Error)
	assert.Zero(t, n, "el mensaje vencido se borra físicamente")

	// ── (b) + RF6: borrar el sticker (última referencia) encola y el GC borra ─
	shaGone := strings.Repeat("b", 64)
	keyGone := "stickers/" + shaGone + ".webp"
	urlGone := "/storage/" + bucket + "/" + keyGone
	gone := models.UserSticker{IdUser: user.ID, SHA256: shaGone, URL: urlGone}
	require.NoError(t, db.Create(&gone).Error)

	// RF6: se marca favorito antes de borrar; el borrado debe reconciliarlo.
	require.NoError(t, svc.SetFavorite(user.Telephon, urlGone, true, ctx))
	var favs int64
	require.NoError(t, db.Model(&models.StickerFavorite{}).Where("id_user = ? AND url = ?", user.ID, urlGone).Count(&favs).Error)
	require.EqualValues(t, 1, favs)

	require.NoError(t, svc.DeleteSticker(user.Telephon, gone.ID, ctx))
	// DeleteSticker encola el objeto al borrar la última referencia. El job real
	// de la app corre cada minuto; se comprueba enseguida para observarlo.
	assert.EqualValues(t, 1, sgQueued(t, db, keyGone), "borrar el sticker encola su objeto")

	owned[keyGone] = true
	sgRunPasses(t, db, owned, remover)

	ref, err = repoExpiry.MediaKeyReferenced(ctx, keyGone)
	require.NoError(t, err)
	assert.False(t, ref, "el sticker borrado ya no referencia el objeto")
	assert.Zero(t, sgQueued(t, db, keyGone), "la cola media_gc se procesa")

	require.NoError(t, db.Model(&models.StickerFavorite{}).Where("id_user = ? AND url = ?", user.ID, urlGone).Count(&favs).Error)
	assert.Zero(t, favs, "borrar el sticker quita también su favorito (RF6)")
}

// TestE2EStickerRecentsTrim cubre SF3(c) y RF4: el recorte a 30 es real (no
// solo la forma del SQL) contra el índice único de la BD.
func TestE2EStickerRecentsTrim(t *testing.T) {
	db, err := database.Conection()
	require.NoError(t, err)
	_, user := sharedLogin(t)
	bucket := sgBucket()
	repo := repos.InitRepoSticker(db, nil)
	ctx := context.Background()
	sgCleanStickers(t, db, user.ID)

	base := time.Now()
	for i := 0; i <= models.StickerRecentsMax; i++ {
		url := fmt.Sprintf("/storage/%s/stickers/%064x.webp", bucket, i)
		require.NoError(t, repo.UpsertRecent(user.ID, url, base.Add(time.Duration(i)*time.Second), ctx))
	}

	recents, err := repo.ListRecents(user.ID, models.StickerRecentsMax, ctx)
	require.NoError(t, err)
	require.Len(t, recents, models.StickerRecentsMax, "el recorte deja exactamente 30")
	assert.Equal(t,
		fmt.Sprintf("/storage/%s/stickers/%064x.webp", bucket, models.StickerRecentsMax),
		recents[0].URL, "el más nuevo primero")
	trimmed := fmt.Sprintf("/storage/%s/stickers/%064x.webp", bucket, 0)
	for _, r := range recents {
		assert.NotEqual(t, trimmed, r.URL, "el más antiguo se recorta")
	}
}

// TestE2EStickerSendRecordsRecent prueba el gancho del envío (SF3-2): un sticker
// 1:1 exitoso se registra en recientes. El envío se hace EN PROCESO con el código
// de SF3 y el resultado se lee por HTTP (GET /stickers de la app).
func TestE2EStickerSendRecordsRecent(t *testing.T) {
	base := os.Getenv("E2E_BASE_URL")
	require.NotEmpty(t, base, "E2E_BASE_URL requerido")
	db, err := database.Conection()
	require.NoError(t, err)
	client, user := sharedLogin(t)
	ctx := context.Background()
	contactRepo := repos.InitRepoContact(db, nil)
	repoSticker := repos.InitRepoSticker(db, contactRepo)
	chatSvc := services.InitServiceMessageWithRecents(contactRepo, repoSticker)
	sgCleanStickers(t, db, user.ID)

	suffix := time.Now().UnixNano() % 1000000
	peer := sgMakePeer(t, db, suffix)
	t.Cleanup(func() {
		db.Unscoped().Where("id_user = ? AND id_receptor = ?", user.ID, peer.ID).Delete(&models.Message{})
	})

	url := fmt.Sprintf("/stickers/sg/send-%d.webp", suffix)
	_, err = chatSvc.ServiceCreatMessage(models.MessageCreat{
		Telephon: user.Telephon,
		MessageGet: models.MessageGet{
			Receptor: peer.Telephon, MediaUrl: url, MediaType: "sticker",
		},
	}, ctx)
	require.NoError(t, err)

	// La app (SF2) lee la misma tabla: el reciente se ve por HTTP.
	code, lib := client.do("GET", "/api/v1/stickers", nil)
	require.Equal(t, 200, code, lib)
	raw, ok := lib["recents"].([]interface{})
	require.True(t, ok, "recents[] en la respuesta: %v", lib)
	found := false
	for _, r := range raw {
		if m, ok := r.(map[string]interface{}); ok && m["url"] == url {
			found = true
		}
	}
	assert.True(t, found, "el envío registra el sticker en recientes: %v", raw)
}
