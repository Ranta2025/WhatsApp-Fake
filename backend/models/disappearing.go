package models

import (
	"errors"
	"time"
)

// Duraciones permitidas (segundos) del temporizador de mensajes temporales.
const (
	DisappearOff      = 0
	Disappear24Hours  = 86400
	Disappear7Days    = 604800
	Disappear90Days   = 7776000
	MessageKindSystem = GroupMessageKindSystem // alineado con los mensajes de sistema de grupo
)

// ErrInvalidDisappearDuration se devuelve cuando la duración no es una de las
// permitidas (0, 24 h, 7 d, 90 d).
var ErrInvalidDisappearDuration = errors.New("duración de mensajes temporales no válida")

// ValidDisappearSeconds indica si seconds es una duración permitida.
func ValidDisappearSeconds(seconds int) bool {
	switch seconds {
	case DisappearOff, Disappear24Hours, Disappear7Days, Disappear90Days:
		return true
	}
	return false
}

// OrderedPair ordena un par de ids de usuario como (menor, mayor) para que
// ambas direcciones de un chat 1:1 compartan una única fila de ajustes.
func OrderedPair(a, b uint) (low, high uint) {
	if a <= b {
		return a, b
	}
	return b, a
}

// ChatSetting guarda los ajustes de un chat 1:1 (no existe entidad de chat).
// El par (UserLowID, UserHighID) está ordenado y es único.
type ChatSetting struct {
	ID               uint `gorm:"primaryKey"`
	UserLowID        uint `gorm:"not null;uniqueIndex:idx_chat_settings_pair"`
	UserHighID       uint `gorm:"not null;uniqueIndex:idx_chat_settings_pair"`
	DisappearSeconds int  `gorm:"not null;default:0"`
	UpdatedByID      uint
	UpdatedAt        time.Time
}

// TableName fija el nombre de la tabla.
func (ChatSetting) TableName() string { return "chat_settings" }

// MediaGC es la cola persistente de objetos de MinIO pendientes de borrar
// (reintentos con backoff). La key es el object key, único.
type MediaGC struct {
	ID            uint   `gorm:"primaryKey"`
	ObjectKey     string `gorm:"size:500;not null;uniqueIndex:idx_media_gc_object_key"`
	Attempts      int    `gorm:"not null;default:0"`
	NextAttemptAt time.Time
	LastError     string `gorm:"size:500"`
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

// TableName fija el nombre de la tabla.
func (MediaGC) TableName() string { return "media_gc" }
