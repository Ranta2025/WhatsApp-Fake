package models

import (
	"errors"
	"time"

	"gorm.io/gorm"
)

// Límites de la biblioteca de stickers (ver odd/tasks/stickers-full.md).
const (
	// MaxUserStickers es el tope de stickers propios por usuario.
	MaxUserStickers = 200
	// MaxStickerFavorites es el tope de favoritos devueltos por el listado.
	MaxStickerFavorites = 100
	// StickerRecentsMax es el tope de recientes por usuario (se recorta a este
	// número al registrar uno nuevo).
	StickerRecentsMax = 30
	// StickerTagsMax es el número máximo de etiquetas por sticker.
	StickerTagsMax = 5
	// StickerTagMaxLen es la longitud máxima de cada etiqueta.
	StickerTagMaxLen = 20
)

// ErrStickerNotFound lo devuelve el repositorio cuando el sticker no existe o
// no pertenece al usuario que consulta (nunca se revela un 403).
var ErrStickerNotFound = errors.New("sticker no encontrado")

// UserSticker es un sticker propio de un usuario. IdUser referencia
// user_data_bases.id igual que Message.IdUser: el dueño sale siempre del
// contexto de autenticación, nunca del request.
//
// La unicidad (id_user, sha256) es parcial (WHERE deleted_at IS NULL) y la crea
// execMigration (ver database/postgres.go): si AutoMigrate la creara total, no
// se podría volver a subir un sticker previamente borrado.
type UserSticker struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	IdUser    uint           `gorm:"index;not null" json:"-"`
	SHA256    string         `gorm:"column:sha256;type:char(64);not null" json:"sha256"`
	URL       string         `gorm:"size:500;not null" json:"url"`
	Animated  bool           `gorm:"not null;default:false" json:"animated"`
	Tags      string         `gorm:"type:text" json:"-"` // minúsculas, separadas por coma
	Favorite  bool           `gorm:"not null;default:false" json:"favorite"`
	CreatedAt time.Time      `json:"createdAt"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

// StickerFavorite es un favorito del usuario. Cubre stickers integrados
// (rutas /stickers/...) y propios, por eso vive en su propia tabla y no en
// una columna de UserSticker.
type StickerFavorite struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	IdUser    uint      `gorm:"index;not null" json:"-"`
	URL       string    `gorm:"size:500;not null" json:"url"`
	CreatedAt time.Time `json:"createdAt"`
}

// StickerRecent es un sticker usado recientemente por el usuario. Se recorta a
// StickerRecentsMax filas por usuario (lo registra SF3 en el envío).
type StickerRecent struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	IdUser     uint      `gorm:"index;not null" json:"-"`
	URL        string    `gorm:"size:500;not null" json:"url"`
	LastUsedAt time.Time `json:"lastUsedAt"`
}

// StickerResponse es la representación camelCase de un sticker propio.
type StickerResponse struct {
	ID        uint      `json:"id"`
	URL       string    `json:"url"`
	SHA256    string    `json:"sha256"`
	Animated  bool      `json:"animated"`
	Favorite  bool      `json:"favorite"`
	Tags      []string  `json:"tags"`
	CreatedAt time.Time `json:"createdAt"`
}

// StickerFavoriteItem es un favorito en la respuesta del listado.
type StickerFavoriteItem struct {
	URL       string    `json:"url"`
	CreatedAt time.Time `json:"createdAt"`
}

// StickerRecentItem es un reciente en la respuesta del listado.
type StickerRecentItem struct {
	URL        string    `json:"url"`
	LastUsedAt time.Time `json:"lastUsedAt"`
}

// StickerLibraryResponse es la respuesta de GET /api/v1/stickers.
type StickerLibraryResponse struct {
	Mine      []StickerResponse     `json:"mine"`
	Favorites []StickerFavoriteItem `json:"favorites"`
	Recents   []StickerRecentItem   `json:"recents"`
}

// StickerSaveInput es el cuerpo de POST /api/v1/stickers/save.
type StickerSaveInput struct {
	URL string `json:"url" binding:"required"`
}

// StickerFavoriteInput es el cuerpo de PUT /api/v1/stickers/favorites.
type StickerFavoriteInput struct {
	URL      string `json:"url" binding:"required"`
	Favorite bool   `json:"favorite"`
}
