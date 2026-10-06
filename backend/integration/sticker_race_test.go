//go:build e2e

// SF7: e2e de los endpoints de stickers contra la BD del stack.
//
//	POSTGRES_PUBLIC_PORT=55432 make test-integration
//
// Reutiliza la sesión compartida (sharedLogin, helpers_test.go) y los dobles
// acotados de sticker_gc_test.go/e2e_disappearing_test.go. Cubre la carrera de
// dedupe (RF8), el tope soft bajo concurrencia (RF8), el cableado de producción
// vía HTTP (RF9), las ramas verdaderas de referencia favorito/reciente (RF12) y
// la supervivencia al encolar-y-luego-referenciar (RF13).
package integration

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"mime/multipart"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"gorm/backend/database"
	"gorm/backend/models"
	"gorm/backend/repos"
	"gorm/backend/services"

	"github.com/minio/minio-go/v7"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// raceStore es un doble de MinIO seguro para concurrencia: siempre dice que el
// objeto no existe (fuerza la subida) y registra cada PutObject.
type raceStore struct {
	mu   sync.Mutex
	puts []string
}

func (s *raceStore) StatObject(context.Context, string, string, minio.StatObjectOptions) (minio.ObjectInfo, error) {
	return minio.ObjectInfo{}, minio.ErrorResponse{Code: "NoSuchKey"}
}

func (s *raceStore) PutObject(_ context.Context, _, object string, r io.Reader, _ int64, _ minio.PutObjectOptions) (minio.UploadInfo, error) {
	_, _ = io.Copy(io.Discard, r)
	s.mu.Lock()
	s.puts = append(s.puts, object)
	s.mu.Unlock()
	return minio.UploadInfo{}, nil
}

func (s *raceStore) distinctPuts() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	seen := map[string]bool{}
	var out []string
	for _, k := range s.puts {
		if !seen[k] {
			seen[k] = true
			out = append(out, k)
		}
	}
	return out
}

// raceFile adapta bytes a multipart.File para el servicio en proceso.
type raceFile struct{ *bytes.Reader }

func (raceFile) Close() error { return nil }

func raceFileOf(b []byte) multipart.File { return raceFile{bytes.NewReader(b)} }

// raceStaticSticker lee el fixture WebP 512x512 estático del paquete services.
func raceStaticSticker(t *testing.T) []byte {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "services", "testdata", "sticker_static_512.webp"))
	require.NoError(t, err)
	return data
}

// RF8 (dedupe): N subidas concurrentes de los MISMOS bytes producen una sola
// fila y un solo objeto (la clave direccionada por contenido es la misma).
func TestE2EStickerUploadDedupeRace(t *testing.T) {
	db, err := database.Conection()
	require.NoError(t, err)
	_, user := sharedLogin(t)
	contactRepo := repos.InitRepoContact(db, nil)
	repoSticker := repos.InitRepoSticker(db, contactRepo)
	store := &raceStore{}
	svc := services.NewServiceStickerLibrary(store, repoSticker)
	sgCleanStickers(t, db, user.ID)

	data := raceStaticSticker(t)
	const n = 8
	var wg sync.WaitGroup
	start := make(chan struct{})
	urls := make([]string, n)
	errs := make([]error, n)
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start
			res, _, err := svc.UploadSticker(user.Telephon, "", raceFileOf(data), &multipart.FileHeader{Size: int64(len(data))}, context.Background())
			errs[i], urls[i] = err, res.URL
		}(i)
	}
	close(start)
	wg.Wait()

	for i, err := range errs {
		require.NoError(t, err, "goroutine %d", i)
	}
	for i := 1; i < n; i++ {
		assert.Equal(t, urls[0], urls[i], "el contenido idéntico da la misma URL")
	}

	mine, err := repoSticker.ListStickers(user.ID, models.MaxUserStickers, context.Background())
	require.NoError(t, err)
	assert.Len(t, mine, 1, "la carrera de dedupe deja una sola fila")
	assert.Len(t, store.distinctPuts(), 1, "el objeto content-addressed se guarda una sola vez")
}

// RF8 (tope): el tope de 200 es un count-then-create SIN garantía dura (no hay
// constraint en la BD), así que N altas concurrentes partiendo de 199 pueden
// superarlo. El test DOCUMENTA el comportamiento soft: el conteo queda entre
// 200 y 199+N. Endurecerlo exigiría una constraint/transacción que no está en
// el alcance de SF7.
func TestE2EStickerUploadCapIsSoftUnderConcurrency(t *testing.T) {
	db, err := database.Conection()
	require.NoError(t, err)
	_, user := sharedLogin(t)
	contactRepo := repos.InitRepoContact(db, nil)
	repoSticker := repos.InitRepoSticker(db, contactRepo)
	store := &raceStore{}
	svc := services.NewServiceStickerLibrary(store, repoSticker)
	sgCleanStickers(t, db, user.ID)

	bucket := sgBucket()
	seed := make([]models.UserSticker, 0, models.MaxUserStickers-1)
	for i := 0; i < models.MaxUserStickers-1; i++ {
		sha := fmt.Sprintf("%064x", i)
		seed = append(seed, models.UserSticker{
			IdUser: user.ID, SHA256: sha, URL: fmt.Sprintf("/storage/%s/stickers/%s.webp", bucket, sha),
		})
	}
	require.NoError(t, db.CreateInBatches(seed, 100).Error)

	base := raceStaticSticker(t)
	const n = 6
	var wg sync.WaitGroup
	start := make(chan struct{})
	errs := make([]error, n)
	for i := 0; i < n; i++ {
		// Contenido distinto por goroutine: se rellena el WebP (la cabecera sigue
		// siendo válida) hasta un tamaño <= 300 KB.
		data := make([]byte, len(base)+i*1024)
		copy(data, base)
		wg.Add(1)
		go func(i int, data []byte) {
			defer wg.Done()
			<-start
			_, _, errs[i] = svc.UploadSticker(user.Telephon, "", raceFileOf(data), &multipart.FileHeader{Size: int64(len(data))}, context.Background())
		}(i, data)
	}
	close(start)
	wg.Wait()

	for i, err := range errs {
		if err != nil {
			assert.ErrorIs(t, err, services.ErrStickerLimit, "goroutine %d solo puede fallar por el tope", i)
		}
	}
	count, err := repoSticker.CountStickers(user.ID, context.Background())
	require.NoError(t, err)
	assert.GreaterOrEqual(t, count, int64(models.MaxUserStickers), "al menos una alta pasa")
	assert.LessOrEqual(t, count, int64(models.MaxUserStickers-1+n), "el tope no se excede más allá de las altas concurrentes")
	t.Logf("RF8: tope soft, filas tras %d altas concurrentes desde %d: %d", n, models.MaxUserStickers-1, count)
}

// RF9: el cableado de producción (app.go, WithRecents) se ejercita por HTTP: un
// sticker enviado con la app real queda en "Recientes" al leer GET /stickers.
func TestE2EStickerSendRecordsRecentViaProductionWiring(t *testing.T) {
	db, err := database.Conection()
	require.NoError(t, err)
	client, user := sharedLogin(t)
	sgCleanStickers(t, db, user.ID)

	suffix := time.Now().UnixNano() % 1000000
	peer := sgMakePeer(t, db, suffix)
	t.Cleanup(func() {
		db.Unscoped().Where("id_user = ? AND id_receptor = ?", user.ID, peer.ID).Delete(&models.Message{})
	})

	url := "/stickers/basic/hola.webp"
	code, body := client.do("POST", "/api/v1/chat", map[string]any{
		"receptor": peer.Telephon, "message": "", "mediaUrl": url, "mediaType": "sticker",
	})
	require.Equal(t, 200, code, body)

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
	assert.True(t, found, "el cableado de producción registra el sticker enviado: %v", raw)
}

// RF12: las ramas VERDADERAS de referencia para favoritos y recientes (SF3 solo
// probaba user_stickers). Una fila viva en cualquiera de las dos tablas impide
// borrar el objeto.
func TestE2EStickerLibraryReferencesProtectObject(t *testing.T) {
	db, err := database.Conection()
	require.NoError(t, err)
	_, user := sharedLogin(t)
	sgCleanStickers(t, db, user.ID)
	repoExpiry := repos.InitRepoExpiry(db)
	ctx := context.Background()
	bucket := sgBucket()

	favSHA := strings.Repeat("c", 64)
	favURL := fmt.Sprintf("/storage/%s/stickers/%s.webp", bucket, favSHA)
	require.NoError(t, db.Create(&models.StickerFavorite{IdUser: user.ID, URL: favURL}).Error)
	ref, err := repoExpiry.MediaKeyReferenced(ctx, "stickers/"+favSHA+".webp")
	require.NoError(t, err)
	assert.True(t, ref, "un favorito vivo referencia el objeto")

	recentSHA := strings.Repeat("d", 64)
	recentURL := fmt.Sprintf("/storage/%s/stickers/%s.webp", bucket, recentSHA)
	require.NoError(t, db.Create(&models.StickerRecent{IdUser: user.ID, URL: recentURL, LastUsedAt: time.Now()}).Error)
	ref, err = repoExpiry.MediaKeyReferenced(ctx, "stickers/"+recentSHA+".webp")
	require.NoError(t, err)
	assert.True(t, ref, "un reciente vivo referencia el objeto")
}

// RF13: si el objeto se encola al borrar la última referencia y, ANTES de que el
// job corra, aparece otra referencia viva, el job re-comprueba y NO lo borra.
func TestE2EStickerEnqueueThenReferenceSurvives(t *testing.T) {
	db, err := database.Conection()
	require.NoError(t, err)
	_, user := sharedLogin(t)
	contactRepo := repos.InitRepoContact(db, nil)
	repoSticker := repos.InitRepoSticker(db, contactRepo)
	svc := services.NewServiceStickerLibrary(sgStore{}, repoSticker)
	sgCleanStickers(t, db, user.ID)

	bucket := sgBucket()
	sha := strings.Repeat("e", 64)
	key := "stickers/" + sha + ".webp"
	url := fmt.Sprintf("/storage/%s/%s", bucket, key)
	row := models.UserSticker{IdUser: user.ID, SHA256: sha, URL: url}
	require.NoError(t, db.Create(&row).Error)

	require.NoError(t, svc.DeleteSticker(user.Telephon, row.ID, context.Background()))
	assert.EqualValues(t, 1, sgQueued(t, db, key), "borrar la última referencia encola el objeto")

	// Una referencia viva aparece antes de que el GC corra.
	ref := models.Message{
		IdUser: user.ID, IdReceptor: user.ID, Message: "referencia viva", Status: "enviado",
		Time: time.Now(), MediaUrl: url, MediaType: "sticker",
	}
	require.NoError(t, db.Create(&ref).Error)
	t.Cleanup(func() { db.Unscoped().Delete(&models.Message{}, ref.ID) })

	owned := map[string]bool{key: true}
	remover := &deRemover{store: services.NewServiceMedia(nil), owned: owned}
	sgRunPasses(t, db, owned, remover)

	assert.NotContains(t, remover.removed(), key, "una referencia viva salva el objeto")
	assert.Zero(t, sgQueued(t, db, key), "el job drena la fila sin borrar (skipped_referenced)")
}
