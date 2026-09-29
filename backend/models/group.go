package models

import (
	"errors"
	"time"

	"gorm.io/gorm"
)

// Group representa un grupo de chat.
// El creador es automáticamente el primer administrador.
type Group struct {
	gorm.Model
	Name        string `gorm:"size:100;not null"`
	Description string `gorm:"size:300"`
	AvatarUrl   string `gorm:"size:500"`
	CreatorID   uint   `gorm:"not null;index"`

	Creator UserDataBase  `gorm:"foreignKey:CreatorID;references:ID"`
	Members []GroupMember `gorm:"foreignKey:GroupID"`
}

// GroupMember registra la membresía de un usuario en un grupo.
// El índice único parcial (group_id, user_id) se aplica en postgres.go
// para permitir soft-delete y re-unirse al grupo.
type GroupMember struct {
	gorm.Model
	GroupID   uint   `gorm:"not null;index"`
	UserID    uint   `gorm:"not null;index"`
	Role      string `gorm:"size:20;not null;default:'member'"` // "admin" | "member"
	AddedByID uint   `gorm:"not null"`

	// Acuses de recibo por miembro (marcas de agua). Los ids de mensaje son
	// seriales globales: solo son comparables dentro de un mismo grupo.
	// Solo avanzan (nunca retroceden) y quedan acotados al máximo id del grupo.
	JoinedMessageID        uint `gorm:"not null;default:0"` // max id de mensaje del grupo al unirse (0 = miembros previos)
	LastDeliveredMessageID uint `gorm:"not null;default:0"`
	LastReadMessageID      uint `gorm:"not null;default:0"`
	LastDeliveredAt        *time.Time
	LastReadAt             *time.Time

	Group   Group        `gorm:"foreignKey:GroupID;references:ID"`
	User    UserDataBase `gorm:"foreignKey:UserID;references:ID"`
	AddedBy UserDataBase `gorm:"foreignKey:AddedByID;references:ID"`
}

// GroupMessage es un mensaje enviado dentro de un grupo.
// Tabla separada de `messages` para independencia total entre chats 1:1 y grupales.
type GroupMessage struct {
	gorm.Model
	GroupID  uint      `gorm:"not null;index"`
	SenderID uint      `gorm:"not null;index"`
	Message  string    `gorm:"size:400"`
	Time     time.Time `gorm:"not null"`
	Edited   bool      `gorm:"default:false"`

	// Campos de media (mismos tipos que Message)
	MediaUrl  string `gorm:"size:500"`
	MediaType string `gorm:"size:20"`

	// Campos para responder mensajes
	ReplyToMessageID *uint   `gorm:"index"`
	ReplyToTelephon  *string `gorm:"column:reply_to_telephon;size:50"`
	ReplyToMessage   *string `gorm:"size:400"`

	Group  Group        `gorm:"foreignKey:GroupID;references:ID"`
	Sender UserDataBase `gorm:"foreignKey:SenderID;references:ID"`
}

// UserGroupRow es un grupo del usuario con los datos agregados para el listado
// (rol del usuario, número de miembros y teléfono del creador).
type UserGroupRow struct {
	Group
	UserRole        string
	MemberCount     int
	CreatorTelephon string
}

// GroupReceiptState son las marcas de agua de acuse de un miembro en un grupo:
// hasta qué id de mensaje ha recibido y hasta cuál ha leído.
type GroupReceiptState struct {
	DeliveredUpTo uint
	ReadUpTo      uint
}

// ErrGroupMessageNotFound lo devuelve el repositorio cuando el mensaje de grupo no existe.
var ErrGroupMessageNotFound = errors.New("mensaje no encontrado")
