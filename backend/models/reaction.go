package models

import (
	"errors"
	"time"
)

// Tipos de mensaje sobre los que se puede reaccionar. Los ids de `messages` y
// `group_messages` son seriales independientes, así que la clave es (kind, id).
const (
	ReactionKindDirect = "direct"
	ReactionKindGroup  = "group"
)

// MessageReaction es la reacción de un usuario a un mensaje. Hay como máximo una
// por (message_kind, message_id, user_id): cambiar de emoji reemplaza la fila y
// quitarla la borra (sin soft delete). Los índices/constraint se aplican en
// database/postgres.go.
type MessageReaction struct {
	ID          uint   `gorm:"primaryKey"`
	MessageKind string `gorm:"size:10;not null"`
	MessageID   uint   `gorm:"not null"`
	UserID      uint   `gorm:"not null"`
	Emoji       string `gorm:"size:32;not null"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

// ReactionAggregate resume una reacción de un mensaje para un espectador.
type ReactionAggregate struct {
	Emoji string
	Count int
	Mine  bool
}

// ReactionUser es un usuario que reaccionó (datos públicos mínimos).
type ReactionUser struct {
	Telephon  string
	Username  string
	AvatarUrl string
}

// ReactionUsers agrupa los usuarios que reaccionaron con un mismo emoji.
type ReactionUsers struct {
	Emoji string
	Users []ReactionUser
}

// ReactionTarget describe el mensaje objetivo ya autorizado: su autor, el otro
// participante (solo 1:1, respecto al usuario que consulta) y el grupo.
type ReactionTarget struct {
	AuthorID       uint
	AuthorTelephon string
	OtherUserID    uint
	OtherTelephon  string // solo 1:1
	GroupID        uint
	// Text y MediaType alimentan el preview del evento `reaction`.
	Text      string
	MediaType string
}

// ReactionActor es el usuario que reacciona, resuelto desde su teléfono.
type ReactionActor struct {
	ID       uint
	Username string
}

// Errores de dominio de reacciones. Un mensaje inexistente o invisible reutiliza
// ErrMessageNotFound (1:1) / ErrGroupMessageNotFound y la no pertenencia
// ErrNotGroupMember.
var (
	ErrInvalidReactionEmoji = errors.New("la reacción debe ser un único emoji")
	ErrInvalidReactionKind  = errors.New("tipo de mensaje no válido para reaccionar")
	ErrReactionRateLimited  = errors.New("demasiadas reacciones, intenta de nuevo en un momento")
)
