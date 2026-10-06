package repos

import (
	"context"
	"errors"
	"time"

	"gorm/backend/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// stickerRepoTimeout acota cada consulta del repositorio de stickers.
const stickerRepoTimeout = 5 * time.Second

// RepoSticker persiste la biblioteca de stickers del usuario: sus stickers
// propios, sus favoritos (integrados y propios) y sus recientes.
type RepoSticker struct {
	data *gorm.DB
	ids  userIDResolver
}

// InitRepoSticker crea el repositorio de stickers. ids resuelve el id del
// usuario desde su teléfono reutilizando la caché del repositorio de contactos.
func InitRepoSticker(data *gorm.DB, ids userIDResolver) *RepoSticker {
	return &RepoSticker{data: data, ids: ids}
}

// GetIdByTelephon delega en el resolvedor de IDs (con caché).
func (r *RepoSticker) GetIdByTelephon(telephon string, ctx context.Context) (int, error) {
	return r.ids.GetIdByTelephon(telephon, ctx)
}

// CountStickers cuenta los stickers activos (no borrados) del usuario.
func (r *RepoSticker) CountStickers(ownerID uint, ctx context.Context) (int64, error) {
	c, cancel := context.WithTimeout(ctx, stickerRepoTimeout)
	defer cancel()
	var n int64
	err := r.data.WithContext(c).Model(&models.UserSticker{}).
		Where("id_user = ?", ownerID).
		Count(&n).Error
	return n, err
}

// GetStickerBySHA devuelve el sticker activo del usuario con ese contenido, o
// models.ErrStickerNotFound. Base de la dedupe idempotente (mismo bytes ->
// misma fila).
func (r *RepoSticker) GetStickerBySHA(ownerID uint, sha256 string, ctx context.Context) (*models.UserSticker, error) {
	c, cancel := context.WithTimeout(ctx, stickerRepoTimeout)
	defer cancel()
	var s models.UserSticker
	err := r.data.WithContext(c).
		Where("id_user = ? AND sha256 = ?", ownerID, sha256).
		First(&s).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, models.ErrStickerNotFound
		}
		return nil, err
	}
	if s.ID == 0 {
		return nil, models.ErrStickerNotFound
	}
	return &s, nil
}

// GetStickerByURL es como GetStickerBySHA pero por URL: se usa para validar
// que un favorito propio apunta a un sticker del usuario.
func (r *RepoSticker) GetStickerByURL(ownerID uint, url string, ctx context.Context) (*models.UserSticker, error) {
	c, cancel := context.WithTimeout(ctx, stickerRepoTimeout)
	defer cancel()
	var s models.UserSticker
	err := r.data.WithContext(c).
		Where("id_user = ? AND url = ?", ownerID, url).
		First(&s).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, models.ErrStickerNotFound
		}
		return nil, err
	}
	if s.ID == 0 {
		return nil, models.ErrStickerNotFound
	}
	return &s, nil
}

// GetStickerByID devuelve el sticker activo del usuario con ese id, o
// models.ErrStickerNotFound (nunca se revela un 403). DeleteSticker lo usa para
// conocer la URL antes de borrar: reconciliar el favorito y encolar el objeto.
func (r *RepoSticker) GetStickerByID(ownerID, id uint, ctx context.Context) (*models.UserSticker, error) {
	c, cancel := context.WithTimeout(ctx, stickerRepoTimeout)
	defer cancel()
	var s models.UserSticker
	err := r.data.WithContext(c).
		Where("id_user = ? AND id = ?", ownerID, id).
		First(&s).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, models.ErrStickerNotFound
		}
		return nil, err
	}
	if s.ID == 0 {
		return nil, models.ErrStickerNotFound
	}
	return &s, nil
}

// MediaKeyReferenced comprueba si el objeto sigue referenciado por alguna fila
// viva. Comparte el SQL de media_gc con el job de expiración (expiryData.go).
func (r *RepoSticker) MediaKeyReferenced(ctx context.Context, key string) (bool, error) {
	return InitRepoExpiry(r.data).MediaKeyReferenced(ctx, key)
}

// EnqueueMediaGC encola un objeto en la cola media_gc para su borrado por el job.
func (r *RepoSticker) EnqueueMediaGC(ctx context.Context, key string) error {
	return InitRepoExpiry(r.data).EnqueueMediaGC(ctx, key)
}

// CreateSticker inserta el sticker o, si el usuario ya tiene uno activo con el
// mismo sha256, devuelve el existente. El segundo valor es true solo cuando se
// creó una fila nueva.
func (r *RepoSticker) CreateSticker(s *models.UserSticker, ctx context.Context) (models.UserSticker, bool, error) {
	c, cancel := context.WithTimeout(ctx, stickerRepoTimeout)
	defer cancel()

	existing, err := r.GetStickerBySHA(s.IdUser, s.SHA256, c)
	if err == nil {
		return *existing, false, nil
	}
	if !errors.Is(err, models.ErrStickerNotFound) {
		return models.UserSticker{}, false, err
	}

	if err := r.data.WithContext(c).Create(s).Error; err != nil {
		// Carrera con otra subida del mismo bytes: el índice parcial único hace
		// fallar una de las dos; se devuelve la fila que ganó.
		if raced, e2 := r.GetStickerBySHA(s.IdUser, s.SHA256, c); e2 == nil {
			return *raced, false, nil
		}
		return models.UserSticker{}, false, err
	}
	return *s, true, nil
}

// ListStickers devuelve los stickers activos del usuario, más recientes primero.
func (r *RepoSticker) ListStickers(ownerID uint, limit int, ctx context.Context) ([]models.UserSticker, error) {
	c, cancel := context.WithTimeout(ctx, stickerRepoTimeout)
	defer cancel()
	var out []models.UserSticker
	err := r.data.WithContext(c).
		Where("id_user = ?", ownerID).
		Order("created_at DESC, id DESC").
		Limit(limit).
		Find(&out).Error
	return out, err
}

// SetStickerFavorite actualiza la marca favorite de un sticker propio (la usan
// los favoritos de stickers propios; los integrados solo viven en
// sticker_favorites).
func (r *RepoSticker) SetStickerFavorite(ownerID, id uint, favorite bool, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, stickerRepoTimeout)
	defer cancel()
	return r.data.WithContext(c).Model(&models.UserSticker{}).
		Where("id_user = ? AND id = ?", ownerID, id).
		Update("favorite", favorite).Error
}

// SoftDeleteSticker marca deleted_at del sticker si es del usuario. Devuelve
// false si no existe o es de otro usuario (el handler responde 404, nunca 403).
func (r *RepoSticker) SoftDeleteSticker(ownerID, id uint, ctx context.Context) (bool, error) {
	c, cancel := context.WithTimeout(ctx, stickerRepoTimeout)
	defer cancel()
	res := r.data.WithContext(c).
		Where("id_user = ? AND id = ?", ownerID, id).
		Delete(&models.UserSticker{})
	if res.Error != nil {
		return false, res.Error
	}
	return res.RowsAffected > 0, nil
}

// UpsertFavorite marca la URL como favorita. Es idempotente: repetir no duplica
// ni pisa created_at (unique (id_user, url)).
func (r *RepoSticker) UpsertFavorite(f *models.StickerFavorite, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, stickerRepoTimeout)
	defer cancel()
	return r.data.WithContext(c).
		Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "id_user"}, {Name: "url"}},
			DoNothing: true,
		}).
		Create(f).Error
}

// DeleteFavorite quita un favorito. Es idempotente.
func (r *RepoSticker) DeleteFavorite(ownerID uint, url string, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, stickerRepoTimeout)
	defer cancel()
	return r.data.WithContext(c).
		Where("id_user = ? AND url = ?", ownerID, url).
		Delete(&models.StickerFavorite{}).Error
}

// ListFavorites devuelve los favoritos del usuario, más recientes primero.
func (r *RepoSticker) ListFavorites(ownerID uint, limit int, ctx context.Context) ([]models.StickerFavorite, error) {
	c, cancel := context.WithTimeout(ctx, stickerRepoTimeout)
	defer cancel()
	var out []models.StickerFavorite
	err := r.data.WithContext(c).
		Where("id_user = ?", ownerID).
		Order("created_at DESC, id DESC").
		Limit(limit).
		Find(&out).Error
	return out, err
}

// UpsertRecent registra el uso de un sticker y recorta los recientes del
// usuario a StickerRecentsMax (borra los más antiguos). Unique (id_user, url).
func (r *RepoSticker) UpsertRecent(ownerID uint, url string, now time.Time, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, stickerRepoTimeout)
	defer cancel()

	if err := r.data.WithContext(c).
		Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "id_user"}, {Name: "url"}},
			DoUpdates: clause.AssignmentColumns([]string{"last_used_at"}),
		}).
		Create(&models.StickerRecent{IdUser: ownerID, URL: url, LastUsedAt: now}).Error; err != nil {
		return err
	}

	keep := r.data.WithContext(c).Model(&models.StickerRecent{}).
		Select("id").
		Where("id_user = ?", ownerID).
		Order("last_used_at DESC, id DESC").
		Limit(models.StickerRecentsMax)
	return r.data.WithContext(c).
		Where("id_user = ? AND id NOT IN (?)", ownerID, keep).
		Delete(&models.StickerRecent{}).Error
}

// ListRecents devuelve los recientes del usuario, más reciente primero.
func (r *RepoSticker) ListRecents(ownerID uint, limit int, ctx context.Context) ([]models.StickerRecent, error) {
	c, cancel := context.WithTimeout(ctx, stickerRepoTimeout)
	defer cancel()
	var out []models.StickerRecent
	err := r.data.WithContext(c).
		Where("id_user = ?", ownerID).
		Order("last_used_at DESC, id DESC").
		Limit(limit).
		Find(&out).Error
	return out, err
}
