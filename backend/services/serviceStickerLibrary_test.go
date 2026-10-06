package services

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"mime/multipart"
	"strings"
	"testing"
	"time"

	"gorm/backend/models"

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

	lastMineLimit   int
	lastFavLimit    int
	lastRecentLimit int
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
