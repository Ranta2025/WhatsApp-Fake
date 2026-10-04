package models

import "time"

// Tipos de chat que se pueden silenciar (columna chat_kind de chat_mutes).
const (
	ChatKindDirect = "direct"
	ChatKindGroup  = "group"
)

// Duraciones admitidas al silenciar un chat (estilo WhatsApp).
const (
	MuteDuration8h     = "8h"
	MuteDuration1w     = "1w"
	MuteDurationAlways = "always"
)

// ChatMute es el silencio de un chat (1:1 o grupo) para un usuario. TargetID
// es el id del otro usuario (direct) o del grupo (group). MutedUntil NULL
// significa "para siempre"; un silencio vencido no se borra: se ignora al
// leer (ActiveAt / los filtros del repositorio) y el siguiente upsert lo pisa.
//
// AutoMigrate es dueño del índice único idx_chat_mutes_user_chat (lo usa el
// upsert ON CONFLICT) y del secundario idx_chat_mutes_target, que sirve al
// filtro del despacho de Web Push de un grupo (kind + grupo).
type ChatMute struct {
	ID         uint       `gorm:"primaryKey" json:"id"`
	UserID     uint       `gorm:"not null;uniqueIndex:idx_chat_mutes_user_chat,priority:1" json:"userId"`
	ChatKind   string     `gorm:"size:10;not null;uniqueIndex:idx_chat_mutes_user_chat,priority:2;index:idx_chat_mutes_target,priority:1;check:chk_chat_mutes_kind,chat_kind IN ('direct','group')" json:"chatKind"`
	TargetID   uint       `gorm:"not null;uniqueIndex:idx_chat_mutes_user_chat,priority:3;index:idx_chat_mutes_target,priority:2" json:"targetId"`
	MutedUntil *time.Time `json:"mutedUntil"`
	CreatedAt  time.Time  `json:"createdAt"`
	UpdatedAt  time.Time  `json:"updatedAt"`
}

// ActiveAt indica si el silencio sigue vigente en now: para siempre (NULL) o
// con vencimiento estrictamente posterior a now.
func (m ChatMute) ActiveAt(now time.Time) bool {
	return m.MutedUntil == nil || m.MutedUntil.After(now)
}

// ActiveMute es un silencio vigente del usuario tal como lo devuelve el
// listado: para los 1:1 incluye el teléfono del otro usuario (los listados
// del sidebar identifican el chat por teléfono).
type ActiveMute struct {
	ChatKind     string
	TargetID     uint
	PeerTelephon string
	MutedUntil   *time.Time
}

// DirectPushState es lo que el despacho de Web Push necesita saber de un
// mensaje 1:1, leído en una sola consulta: si el receptor silenció el chat y
// el estado de la fila de contacto del receptor hacia el remitente ("" si no
// lo tiene agregado).
type DirectPushState struct {
	Muted         bool
	ContactStatus string
}

// MuteInput es el cuerpo de PUT chat/:contact/mute y PUT group/:groupID/mute.
type MuteInput struct {
	Duration string `json:"duration"`
}
