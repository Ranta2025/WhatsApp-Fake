package services

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"strings"
	"testing"
	"time"

	"gorm/backend/models"
	"gorm/backend/utils"

	"github.com/minio/minio-go/v7"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// fakeStickerRepo implementa StickerRepoInterface en memoria para los tests del
// servicio de biblioteca (sin base de datos).
type fakeStickerRepo struct {
	userID    int
	userErr   error
	stickers  []models.UserSticker
	favorites []models.StickerFavorite
	recents   []models.StickerRecent

	// GC (SF3): referenced simula media_gc.MediaKeyReferenced; enqueued registra
	// los object keys encolados al borrar la última referencia.
	referenced map[string]bool
	enqueued   []string

	// RF11: inyección de fallos en las ramas de "registrar y continuar" del
	// borrado (reconciliación de favorito, comprobación de referencia y encolado).
	favDeleteErr  error
	referencedErr error
	enqueueErr    error

	lastMineLimit   int
	lastFavLimit    int
	lastRecentLimit int
}

func (f *fakeStickerRepo) GetStickerByID(ownerID, id uint, _ context.Context) (*models.UserSticker, error) {
	for i := range f.stickers {
		s := f.stickers[i]
		if s.IdUser == ownerID && s.ID == id && !s.DeletedAt.Valid {
			return &s, nil
		}
	}
	return nil, models.ErrStickerNotFound
}

func (f *fakeStickerRepo) MediaKeyReferenced(_ context.Context, key string) (bool, error) {
	if f.referencedErr != nil {
		return false, f.referencedErr
	}
	return f.referenced[key], nil
}

func (f *fakeStickerRepo) EnqueueMediaGC(_ context.Context, key string) error {
	f.enqueued = append(f.enqueued, key)
	return f.enqueueErr
}

func (f *fakeStickerRepo) GetIdByTelephon(string, context.Context) (int, error) {
	return f.userID, f.userErr
}

func (f *fakeStickerRepo) CountStickers(ownerID uint, _ context.Context) (int64, error) {
	var n int64
	for _, s := range f.stickers {
		if s.IdUser == ownerID && !s.DeletedAt.Valid {
			n++
		}
	}
	return n, nil
}

func (f *fakeStickerRepo) GetStickerBySHA(ownerID uint, sha string, _ context.Context) (*models.UserSticker, error) {
	for i := range f.stickers {
		s := f.stickers[i]
		if s.IdUser == ownerID && s.SHA256 == sha && !s.DeletedAt.Valid {
			return &s, nil
		}
	}
	return nil, models.ErrStickerNotFound
}

func (f *fakeStickerRepo) CreateSticker(s *models.UserSticker, _ context.Context) (models.UserSticker, bool, error) {
	for _, e := range f.stickers {
		if e.IdUser == s.IdUser && e.SHA256 == s.SHA256 && !e.DeletedAt.Valid {
			return e, false, nil
		}
	}
	s.ID = uint(len(f.stickers) + 1)
	f.stickers = append(f.stickers, *s)
	return *s, true, nil
}

func (f *fakeStickerRepo) ListStickers(ownerID uint, limit int, _ context.Context) ([]models.UserSticker, error) {
	f.lastMineLimit = limit
	var out []models.UserSticker
	for _, s := range f.stickers {
		if s.IdUser == ownerID && !s.DeletedAt.Valid {
			out = append(out, s)
		}
	}
	if limit > 0 && len(out) > limit {
		out = out[:limit]
	}
	return out, nil
}

func (f *fakeStickerRepo) GetStickerByURL(ownerID uint, url string, _ context.Context) (*models.UserSticker, error) {
	for i := range f.stickers {
		s := f.stickers[i]
		if s.IdUser == ownerID && s.URL == url && !s.DeletedAt.Valid {
			return &s, nil
		}
	}
	return nil, models.ErrStickerNotFound
}

func (f *fakeStickerRepo) SetStickerFavorite(ownerID, id uint, favorite bool, _ context.Context) error {
	for i := range f.stickers {
		if f.stickers[i].IdUser == ownerID && f.stickers[i].ID == id && !f.stickers[i].DeletedAt.Valid {
			f.stickers[i].Favorite = favorite
		}
	}
	return nil
}

func (f *fakeStickerRepo) SoftDeleteSticker(ownerID, id uint, _ context.Context) (bool, error) {
	for i := range f.stickers {
		if f.stickers[i].IdUser == ownerID && f.stickers[i].ID == id && !f.stickers[i].DeletedAt.Valid {
			f.stickers[i].DeletedAt = gorm.DeletedAt{Time: time.Now(), Valid: true}
			return true, nil
		}
	}
	return false, nil
}

func (f *fakeStickerRepo) UpsertFavorite(fav *models.StickerFavorite, _ context.Context) error {
	for i := range f.favorites {
		if f.favorites[i].IdUser == fav.IdUser && f.favorites[i].URL == fav.URL {
			return nil
		}
	}
	fav.ID = uint(len(f.favorites) + 1)
	f.favorites = append(f.favorites, *fav)
	return nil
}

func (f *fakeStickerRepo) DeleteFavorite(ownerID uint, url string, _ context.Context) error {
	if f.favDeleteErr != nil {
		return f.favDeleteErr
	}
	out := make([]models.StickerFavorite, 0, len(f.favorites))
	for _, fav := range f.favorites {
		if !(fav.IdUser == ownerID && fav.URL == url) {
			out = append(out, fav)
		}
	}
	f.favorites = out
	return nil
}

func (f *fakeStickerRepo) ListFavorites(ownerID uint, limit int, _ context.Context) ([]models.StickerFavorite, error) {
	f.lastFavLimit = limit
	var out []models.StickerFavorite
	for _, fav := range f.favorites {
		if fav.IdUser == ownerID {
			out = append(out, fav)
		}
	}
	if limit > 0 && len(out) > limit {
		out = out[:limit]
	}
	return out, nil
}

func (f *fakeStickerRepo) UpsertRecent(ownerID uint, url string, now time.Time, _ context.Context) error {
	for i := range f.recents {
		if f.recents[i].IdUser == ownerID && f.recents[i].URL == url {
			f.recents[i].LastUsedAt = now
			return nil
		}
	}
	f.recents = append(f.recents, models.StickerRecent{IdUser: ownerID, URL: url, LastUsedAt: now})
	return nil
}

func (f *fakeStickerRepo) ListRecents(ownerID uint, limit int, _ context.Context) ([]models.StickerRecent, error) {
	f.lastRecentLimit = limit
	var out []models.StickerRecent
	for _, r := range f.recents {
		if r.IdUser == ownerID {
			out = append(out, r)
		}
	}
	if limit > 0 && len(out) > limit {
		out = out[:limit]
	}
	return out, nil
}

func stickerFixtureSHA(t *testing.T) ([]byte, string) {
	t.Helper()
	data := loadStickerFixture(t, "sticker_static_512.webp")
	sum := sha256.Sum256(data)
	return data, hex.EncodeToString(sum[:])
}

func TestNormalizeStickerTags(t *testing.T) {
	tests := []struct {
		name string
		raw  string
		want []string
	}{
		{"vacío", "", nil},
		{"minúsculas, recorte y dedupe", " HOLA, mundo ,hola", []string{"hola", "mundo"}},
		{"máximo 5 etiquetas", "uno,dos,tres,cuatro,cinco,seis", []string{"uno", "dos", "tres", "cuatro", "cinco"}},
		{"etiqueta truncada a 20", "averyveryverylongtagname12345", []string{"averyveryverylongtag"}},
		{"comas vacías ignoradas", ",,hola,,", []string{"hola"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, normalizeStickerTags(tt.raw))
		})
	}
}

func TestStickerLibraryUploadDuplicateReturnsExisting(t *testing.T) {
	t.Setenv("MINIO_BUCKET", "media")
	t.Setenv("MEDIA_PUBLIC_BASE_URL", "")
	data, sha := stickerFixtureSHA(t)

	repo := &fakeStickerRepo{userID: 7, stickers: []models.UserSticker{
		{ID: 42, IdUser: 7, SHA256: sha, URL: "/storage/media/stickers/" + sha + ".webp"},
	}}
	svc := NewServiceStickerLibrary(&fakeStickerStore{}, repo)

	res, created, err := svc.UploadSticker("+51999", "", memStickerFileOf(data), &multipart.FileHeader{Size: int64(len(data))}, context.Background())
	require.NoError(t, err)
	assert.False(t, created)
	assert.Equal(t, uint(42), res.ID)
	assert.Len(t, repo.stickers, 1, "un duplicado no crea una fila nueva")
}

func TestStickerLibraryUploadCreatesNewWithTags(t *testing.T) {
	t.Setenv("MINIO_BUCKET", "media")
	t.Setenv("MEDIA_PUBLIC_BASE_URL", "")
	data, _ := stickerFixtureSHA(t)
	repo := &fakeStickerRepo{userID: 7}
	svc := NewServiceStickerLibrary(&fakeStickerStore{}, repo)

	res, created, err := svc.UploadSticker("+51999", " Hola ,MUNDO,hola", memStickerFileOf(data), &multipart.FileHeader{Size: int64(len(data))}, context.Background())
	require.NoError(t, err)
	assert.True(t, created)
	assert.Equal(t, []string{"hola", "mundo"}, res.Tags)
	require.Len(t, repo.stickers, 1)
	assert.Equal(t, "hola,mundo", repo.stickers[0].Tags)
}

func TestStickerLibraryUploadEnforcesCap(t *testing.T) {
	t.Setenv("MINIO_BUCKET", "media")
	data, _ := stickerFixtureSHA(t)
	repo := &fakeStickerRepo{userID: 7}
	for i := 0; i < models.MaxUserStickers; i++ {
		repo.stickers = append(repo.stickers, models.UserSticker{ID: uint(i + 1), IdUser: 7, SHA256: fmt.Sprintf("%064d", i)})
	}
	svc := NewServiceStickerLibrary(&fakeStickerStore{}, repo)

	_, _, err := svc.UploadSticker("+51999", "", memStickerFileOf(data), &multipart.FileHeader{Size: int64(len(data))}, context.Background())
	assert.ErrorIs(t, err, ErrStickerLimit)
}

func TestStickerLibraryUploadDuplicateAtCapIsAllowed(t *testing.T) {
	t.Setenv("MINIO_BUCKET", "media")
	data, sha := stickerFixtureSHA(t)
	repo := &fakeStickerRepo{userID: 7}
	for i := 0; i < models.MaxUserStickers-1; i++ {
		repo.stickers = append(repo.stickers, models.UserSticker{ID: uint(i + 1), IdUser: 7, SHA256: fmt.Sprintf("%064d", i)})
	}
	repo.stickers = append(repo.stickers, models.UserSticker{ID: 200, IdUser: 7, SHA256: sha})
	svc := NewServiceStickerLibrary(&fakeStickerStore{}, repo)

	_, created, err := svc.UploadSticker("+51999", "", memStickerFileOf(data), &multipart.FileHeader{Size: int64(len(data))}, context.Background())
	require.NoError(t, err)
	assert.False(t, created)
	assert.Len(t, repo.stickers, models.MaxUserStickers)
}

func TestStickerLibrarySaveRejectsBuiltin(t *testing.T) {
	svc := NewServiceStickerLibrary(&fakeStickerStore{}, &fakeStickerRepo{userID: 7})
	_, _, err := svc.SaveSticker("+51999", "/stickers/basic/hola.webp", context.Background())
	assert.ErrorIs(t, err, ErrStickerBuiltinFavorite)
}

func TestStickerLibrarySaveRejectsForeignURL(t *testing.T) {
	svc := NewServiceStickerLibrary(&fakeStickerStore{}, &fakeStickerRepo{userID: 7})
	_, _, err := svc.SaveSticker("+51999", "https://evil.example/x.webp", context.Background())
	assert.ErrorIs(t, err, ErrStickerSaveURLInvalid)
}

func TestStickerLibrarySaveReferencesExistingObject(t *testing.T) {
	t.Setenv("MINIO_BUCKET", "media")
	t.Setenv("MEDIA_PUBLIC_BASE_URL", "")
	sha := strings.Repeat("a", 64)
	url := "/storage/media/stickers/" + sha + ".webp"
	repo := &fakeStickerRepo{userID: 7}
	store := &fakeStickerStore{}
	svc := NewServiceStickerLibrary(store, repo)

	res, created, err := svc.SaveSticker("+51999", url, context.Background())
	require.NoError(t, err)
	assert.True(t, created)
	assert.Equal(t, url, res.URL, "se guarda la misma URL, sin copia")
	assert.Equal(t, sha, res.SHA256)
	assert.Equal(t, []string{"stickers/" + sha + ".webp"}, store.statKeys)
	assert.Empty(t, store.putKeys, "guardar no copia el objeto")

	_, created2, err := svc.SaveSticker("+51999", url, context.Background())
	require.NoError(t, err)
	assert.False(t, created2, "guardar dos veces es idempotente")
	assert.Len(t, repo.stickers, 1)
}

func TestStickerLibrarySaveMissingObject(t *testing.T) {
	t.Setenv("MINIO_BUCKET", "media")
	t.Setenv("MEDIA_PUBLIC_BASE_URL", "")
	sha := strings.Repeat("b", 64)
	store := &fakeStickerStore{statErr: minio.ErrorResponse{Code: "NoSuchKey"}}
	svc := NewServiceStickerLibrary(store, &fakeStickerRepo{userID: 7})

	_, _, err := svc.SaveSticker("+51999", "/storage/media/stickers/"+sha+".webp", context.Background())
	assert.ErrorIs(t, err, models.ErrStickerNotFound)
}

func TestStickerLibrarySaveAbsolutePublicBase(t *testing.T) {
	t.Setenv("MINIO_BUCKET", "media")
	t.Setenv("MEDIA_PUBLIC_BASE_URL", "https://pub-x.r2.dev")
	sha := strings.Repeat("c", 64)
	url := "https://pub-x.r2.dev/stickers/" + sha + ".webp"
	store := &fakeStickerStore{}
	repo := &fakeStickerRepo{userID: 7}
	svc := NewServiceStickerLibrary(store, repo)

	res, created, err := svc.SaveSticker("+51999", url, context.Background())
	require.NoError(t, err)
	assert.True(t, created)
	assert.Equal(t, sha, res.SHA256)
	assert.Equal(t, []string{"stickers/" + sha + ".webp"}, store.statKeys)
}

func TestStickerLibraryFavorites(t *testing.T) {
	t.Setenv("MINIO_BUCKET", "media")
	sha := strings.Repeat("d", 64)
	custom := "/storage/media/stickers/" + sha + ".webp"
	repo := &fakeStickerRepo{userID: 7, stickers: []models.UserSticker{{ID: 1, IdUser: 7, URL: custom}}}
	svc := NewServiceStickerLibrary(&fakeStickerStore{}, repo)

	require.NoError(t, svc.SetFavorite("+51999", "/stickers/basic/hola.webp", true, context.Background()))
	require.NoError(t, svc.SetFavorite("+51999", custom, true, context.Background()))
	assert.Len(t, repo.favorites, 2)
	assert.True(t, repo.stickers[0].Favorite)

	require.NoError(t, svc.SetFavorite("+51999", custom, false, context.Background()))
	assert.False(t, repo.stickers[0].Favorite)

	assert.ErrorIs(t, svc.SetFavorite("+51999", "https://evil.example/x.webp", true, context.Background()), ErrStickerFavoriteInvalid)
}

func TestStickerLibraryDeleteCrossUserReturnsNotFound(t *testing.T) {
	repo := &fakeStickerRepo{userID: 8, stickers: []models.UserSticker{{ID: 1, IdUser: 7, URL: "u"}}}
	svc := NewServiceStickerLibrary(&fakeStickerStore{}, repo)

	err := svc.DeleteSticker("+51888", 1, context.Background())
	assert.ErrorIs(t, err, models.ErrStickerNotFound)
}

func TestStickerLibraryDeleteOwned(t *testing.T) {
	repo := &fakeStickerRepo{userID: 7, stickers: []models.UserSticker{{ID: 1, IdUser: 7, URL: "u"}}}
	svc := NewServiceStickerLibrary(&fakeStickerStore{}, repo)

	require.NoError(t, svc.DeleteSticker("+51999", 1, context.Background()))
	assert.True(t, repo.stickers[0].DeletedAt.Valid)
	assert.ErrorIs(t, svc.DeleteSticker("+51999", 1, context.Background()), models.ErrStickerNotFound)
}

func TestStickerLibraryListCapsAndTags(t *testing.T) {
	repo := &fakeStickerRepo{
		userID:    7,
		stickers:  []models.UserSticker{{ID: 1, IdUser: 7, URL: "u", SHA256: "s", Tags: "hola,mundo"}},
		favorites: []models.StickerFavorite{{IdUser: 7, URL: "/stickers/basic/hola.webp"}},
		recents:   []models.StickerRecent{{IdUser: 7, URL: "u"}},
	}
	svc := NewServiceStickerLibrary(&fakeStickerStore{}, repo)

	lib, err := svc.ListStickers("+51999", context.Background())
	require.NoError(t, err)
	require.Len(t, lib.Mine, 1)
	assert.Equal(t, []string{"hola", "mundo"}, lib.Mine[0].Tags)
	require.Len(t, lib.Favorites, 1)
	require.Len(t, lib.Recents, 1)
	assert.Equal(t, models.MaxUserStickers, repo.lastMineLimit)
	assert.Equal(t, models.MaxStickerFavorites, repo.lastFavLimit)
	assert.Equal(t, models.StickerRecentsMax, repo.lastRecentLimit)
}

func TestStickerLibraryResolveUserErrorPropagates(t *testing.T) {
	repo := &fakeStickerRepo{userErr: assert.AnError}
	svc := NewServiceStickerLibrary(&fakeStickerStore{}, repo)
	_, _, err := svc.UploadSticker("+51999", "", memStickerFileOf([]byte("x")), &multipart.FileHeader{}, context.Background())
	assert.ErrorIs(t, err, assert.AnError)
}

// fakeStickerStoreWithObject añade lecturas de objeto (RF1) al doble de SF1 sin
// tocar serviceSticker_test.go: embebe el fake compartido y sobrescribe
// GetObject para devolver bytes en memoria.
type fakeStickerStoreWithObject struct {
	*fakeStickerStore
	objectData []byte
	objectErr  error
}

func (f *fakeStickerStoreWithObject) GetObject(_ context.Context, _, _ string, _ minio.GetObjectOptions) (io.ReadCloser, error) {
	if f.objectErr != nil {
		return nil, f.objectErr
	}
	return io.NopCloser(bytes.NewReader(f.objectData)), nil
}

// RF1: al guardar un sticker ya almacenado, el flag animated se deriva de los
// bytes del objeto (no se asume false).
func TestStickerLibrarySaveDerivesAnimatedFromObject(t *testing.T) {
	t.Setenv("MINIO_BUCKET", "media")
	t.Setenv("MEDIA_PUBLIC_BASE_URL", "")
	animated := loadStickerFixture(t, "sticker_anim_512.webp")
	sha := strings.Repeat("e", 64)
	url := "/storage/media/stickers/" + sha + ".webp"
	store := &fakeStickerStoreWithObject{fakeStickerStore: &fakeStickerStore{}, objectData: animated}
	svc := NewServiceStickerLibrary(store, &fakeStickerRepo{userID: 7})

	res, created, err := svc.SaveSticker("+51999", url, context.Background())
	require.NoError(t, err)
	assert.True(t, created)
	assert.True(t, res.Animated, "un sticker animado guardado debe listarse como animado")
}

func TestStickerLibrarySaveStaticObjectStaysNotAnimated(t *testing.T) {
	t.Setenv("MINIO_BUCKET", "media")
	t.Setenv("MEDIA_PUBLIC_BASE_URL", "")
	static := loadStickerFixture(t, "sticker_static_512.webp")
	sha := strings.Repeat("d", 64)
	url := "/storage/media/stickers/" + sha + ".webp"
	store := &fakeStickerStoreWithObject{fakeStickerStore: &fakeStickerStore{}, objectData: static}
	svc := NewServiceStickerLibrary(store, &fakeStickerRepo{userID: 7})

	res, _, err := svc.SaveSticker("+51999", url, context.Background())
	require.NoError(t, err)
	assert.False(t, res.Animated, "un sticker estático sigue sin ser animado")
}

// Un fallo al leer los bytes no debe fallar el guardado: cae a animated=false.
func TestStickerLibrarySaveObjectReadErrorDefaultsNotAnimated(t *testing.T) {
	t.Setenv("MINIO_BUCKET", "media")
	t.Setenv("MEDIA_PUBLIC_BASE_URL", "")
	sha := strings.Repeat("c", 64)
	url := "/storage/media/stickers/" + sha + ".webp"
	store := &fakeStickerStoreWithObject{fakeStickerStore: &fakeStickerStore{}, objectErr: assert.AnError}
	svc := NewServiceStickerLibrary(store, &fakeStickerRepo{userID: 7})

	res, _, err := svc.SaveSticker("+51999", url, context.Background())
	require.NoError(t, err, "un fallo de lectura no debe impedir guardar")
	assert.False(t, res.Animated)
}

// RF6: borrar un sticker propio quita también su fila de favorito (misma URL).
func TestStickerLibraryDeleteRemovesFavorite(t *testing.T) {
	t.Setenv("MINIO_BUCKET", "media")
	t.Setenv("MEDIA_PUBLIC_BASE_URL", "")
	sha := strings.Repeat("f", 64)
	url := "/storage/media/stickers/" + sha + ".webp"
	repo := &fakeStickerRepo{
		userID:    7,
		stickers:  []models.UserSticker{{ID: 1, IdUser: 7, URL: url, SHA256: sha}},
		favorites: []models.StickerFavorite{{ID: 1, IdUser: 7, URL: url}},
	}
	svc := NewServiceStickerLibrary(&fakeStickerStore{}, repo)

	require.NoError(t, svc.DeleteSticker("+51999", 1, context.Background()))
	assert.Empty(t, repo.favorites, "borrar un sticker propio quita también su favorito")
}

// RF5: la extracción de sha no debe entrar en pánico ni aceptar nombres vacíos
// o sin extensión.
func TestStickerKeyFromURLRejectsMalformed(t *testing.T) {
	t.Setenv("MINIO_BUCKET", "media")
	t.Setenv("MEDIA_PUBLIC_BASE_URL", "")
	svc := NewServiceStickerLibrary(&fakeStickerStore{}, &fakeStickerRepo{userID: 7})

	cases := []string{
		"",
		"/storage/media/stickers/",
		"/storage/media/stickers/.webp",
		"/storage/media/stickers/abc.webp",
		"/storage/media/stickers/" + strings.Repeat("a", 64),
		"/storage/media/stickers/" + strings.Repeat("a", 63) + ".webp",
		"/storage/media/stickers/" + strings.Repeat("a", 64) + ".gif",
		"/storage/media/stickers/" + strings.Repeat("Z", 64) + ".webp",
		"/storage/media/other/" + strings.Repeat("a", 64) + ".webp",
	}
	for _, raw := range cases {
		_, _, ok := svc.stickerKeyFromURL(raw)
		assert.False(t, ok, "%q", raw)
	}
}

// Un nombre con forma válida pero sin parte de sha no debe entrar en pánico.
func TestStickerKeyFromURLNeverPanicsOnExtensionlessName(t *testing.T) {
	t.Setenv("MINIO_BUCKET", "media")
	t.Setenv("MEDIA_PUBLIC_BASE_URL", "")
	svc := NewServiceStickerLibrary(&fakeStickerStore{}, &fakeStickerRepo{userID: 7})
	assert.NotPanics(t, func() {
		_, _, _ = svc.stickerKeyFromURL("/storage/media/stickers/" + strings.Repeat("a", 64))
	})
}

// RF6 + GC: borrar el último sticker encola su objeto; si algo lo referencia,
// no se encola (lo decide el GC con MediaKeyReferenced).
func TestStickerLibraryDeleteEnqueuesWhenUnreferenced(t *testing.T) {
	t.Setenv("MINIO_BUCKET", "media")
	t.Setenv("MEDIA_PUBLIC_BASE_URL", "")
	sha := strings.Repeat("1", 64)
	url := "/storage/media/stickers/" + sha + ".webp"
	key := "stickers/" + sha + ".webp"
	repo := &fakeStickerRepo{
		userID:     7,
		stickers:   []models.UserSticker{{ID: 3, IdUser: 7, URL: url, SHA256: sha}},
		referenced: map[string]bool{},
	}
	svc := NewServiceStickerLibrary(&fakeStickerStore{}, repo)

	require.NoError(t, svc.DeleteSticker("+51999", 3, context.Background()))
	assert.Equal(t, []string{key}, repo.enqueued, "el objeto se encola al borrar la última referencia")
}

func TestStickerLibraryDeleteSkipsEnqueueWhenStillReferenced(t *testing.T) {
	t.Setenv("MINIO_BUCKET", "media")
	t.Setenv("MEDIA_PUBLIC_BASE_URL", "")
	sha := strings.Repeat("2", 64)
	url := "/storage/media/stickers/" + sha + ".webp"
	key := "stickers/" + sha + ".webp"
	repo := &fakeStickerRepo{
		userID:     7,
		stickers:   []models.UserSticker{{ID: 4, IdUser: 7, URL: url, SHA256: sha}},
		referenced: map[string]bool{key: true},
	}
	svc := NewServiceStickerLibrary(&fakeStickerStore{}, repo)

	require.NoError(t, svc.DeleteSticker("+51999", 4, context.Background()))
	assert.Empty(t, repo.enqueued, "un mensaje vivo que usa el sticker impide encolarlo")
}

// RF3: un archivo que SF1 rechaza (formato/dimensiones/tamaño) se degrada a
// ErrStickerInvalid (400), nunca a un error interno.
func TestStickerLibraryUploadInvalidFileWrapsInvalid(t *testing.T) {
	t.Setenv("MINIO_BUCKET", "media")
	t.Setenv("MEDIA_PUBLIC_BASE_URL", "")
	repo := &fakeStickerRepo{userID: 7}
	svc := NewServiceStickerLibrary(&fakeStickerStore{}, repo)

	_, _, err := svc.UploadSticker("+51999", "", memStickerFileOf([]byte("no soy un sticker")), &multipart.FileHeader{}, context.Background())

	require.Error(t, err)
	assert.ErrorIs(t, err, ErrStickerInvalid, "un rechazo de validación es 400")
	assert.False(t, utils.IsInternalError(err), "un rechazo de validación no es un fallo interno")
	assert.Empty(t, repo.stickers, "un archivo inválido no se persiste")
}

// RF3: un fallo de infraestructura al subir NO se degrada a validación: se
// propaga tal cual para que el handler responda 500 sin filtrar detalles.
func TestStickerLibraryUploadInternalErrorPassesThrough(t *testing.T) {
	t.Setenv("MINIO_BUCKET", "media")
	t.Setenv("MEDIA_PUBLIC_BASE_URL", "")
	data, _ := stickerFixtureSHA(t)
	store := &fakeStickerStore{statErr: context.DeadlineExceeded}
	svc := NewServiceStickerLibrary(store, &fakeStickerRepo{userID: 7})

	_, _, err := svc.UploadSticker("+51999", "", memStickerFileOf(data), &multipart.FileHeader{Size: int64(len(data))}, context.Background())

	require.Error(t, err)
	assert.False(t, errors.Is(err, ErrStickerInvalid), "un fallo interno no se confunde con validación")
	assert.True(t, utils.IsInternalError(err), "el fallo interno conserva su cadena")
}

// RF11: si la reconciliación del favorito falla, el borrado del sticker sigue
// (registrar y continuar): el usuario no ve un error por un favorito huérfano.
func TestStickerLibraryDeleteContinuesWhenFavoriteReconcileFails(t *testing.T) {
	t.Setenv("MINIO_BUCKET", "media")
	t.Setenv("MEDIA_PUBLIC_BASE_URL", "")
	sha := strings.Repeat("3", 64)
	url := "/storage/media/stickers/" + sha + ".webp"
	repo := &fakeStickerRepo{
		userID:       7,
		stickers:     []models.UserSticker{{ID: 5, IdUser: 7, URL: url, SHA256: sha}},
		favorites:    []models.StickerFavorite{{ID: 1, IdUser: 7, URL: url}},
		favDeleteErr: assert.AnError,
	}
	svc := NewServiceStickerLibrary(&fakeStickerStore{}, repo)

	require.NoError(t, svc.DeleteSticker("+51999", 5, context.Background()), "un fallo de favorito no rompe el borrado")
	assert.True(t, repo.stickers[0].DeletedAt.Valid, "el sticker queda borrado igualmente")
}

// RF11: si no se puede comprobar la referencia, no se encola (ni se rompe).
func TestStickerLibraryDeleteSkipsEnqueueWhenReferenceCheckFails(t *testing.T) {
	t.Setenv("MINIO_BUCKET", "media")
	t.Setenv("MEDIA_PUBLIC_BASE_URL", "")
	sha := strings.Repeat("4", 64)
	url := "/storage/media/stickers/" + sha + ".webp"
	repo := &fakeStickerRepo{
		userID:        7,
		stickers:      []models.UserSticker{{ID: 6, IdUser: 7, URL: url, SHA256: sha}},
		referencedErr: assert.AnError,
	}
	svc := NewServiceStickerLibrary(&fakeStickerStore{}, repo)

	require.NoError(t, svc.DeleteSticker("+51999", 6, context.Background()))
	assert.Empty(t, repo.enqueued, "sin poder comprobar la referencia no se encola a ciegas")
}

// RF11: si el encolado falla, el borrado igualmente termina bien.
func TestStickerLibraryDeleteContinuesWhenEnqueueFails(t *testing.T) {
	t.Setenv("MINIO_BUCKET", "media")
	t.Setenv("MEDIA_PUBLIC_BASE_URL", "")
	sha := strings.Repeat("5", 64)
	url := "/storage/media/stickers/" + sha + ".webp"
	key := "stickers/" + sha + ".webp"
	repo := &fakeStickerRepo{
		userID:     7,
		stickers:   []models.UserSticker{{ID: 7, IdUser: 7, URL: url, SHA256: sha}},
		referenced: map[string]bool{},
		enqueueErr: assert.AnError,
	}
	svc := NewServiceStickerLibrary(&fakeStickerStore{}, repo)

	require.NoError(t, svc.DeleteSticker("+51999", 7, context.Background()), "un fallo del GC no rompe el borrado")
	assert.Equal(t, []string{key}, repo.enqueued, "se intentó encolar antes de fallar")
}

// RF14: el adaptador de producción envuelve *minio.Client para poder leer los
// bytes (RF1) sin cambiar StatObject/PutObject.
func TestInitServiceStickerLibraryWrapsMinioClient(t *testing.T) {
	client, err := minio.New("127.0.0.1:9000", &minio.Options{Secure: false})
	require.NoError(t, err)

	svc := InitServiceStickerLibrary(client, &fakeStickerRepo{userID: 7})

	concrete, ok := svc.(*ServiceStickerLibrary)
	require.True(t, ok)
	wrapped, ok := concrete.store.(MinioStickerStore)
	require.True(t, ok, "el cliente MinIO se envuelve para poder leer bytes")
	assert.Same(t, client, wrapped.Client, "el cliente original se conserva")
	assert.NotNil(t, stickerObjectGetter(concrete.store), "el store envuelto sabe leer objetos")
}

// RF14: un store que ya sabe leer (los dobles de test) se usa tal cual.
func TestInitServiceStickerLibraryKeepsReaderStoreAsIs(t *testing.T) {
	store := &fakeStickerStoreWithObject{fakeStickerStore: &fakeStickerStore{}}

	svc := InitServiceStickerLibrary(store, &fakeStickerRepo{userID: 7})

	concrete, ok := svc.(*ServiceStickerLibrary)
	require.True(t, ok)
	assert.Same(t, store, concrete.store, "un store que ya sabe leer no se reenvuelve")
}
