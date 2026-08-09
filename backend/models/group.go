package models

import (
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
	SentAt   time.Time `gorm:"column:sent_at;not null;index"`
	Edited   bool      `gorm:"default:false"`

	// Campos de media (mismos tipos que Message)
	MediaUrl  string `gorm:"size:2048"`
	MediaType string `gorm:"size:20"`

	// Campos para responder mensajes
	ReplyToMessageID *uint   `gorm:"index"`
	ReplyToTelephon  *string `gorm:"column:reply_to_telephon;size:50"`
	ReplyToMessage   *string `gorm:"size:400"`

	Group  Group        `gorm:"foreignKey:GroupID;references:ID"`
	Sender UserDataBase `gorm:"foreignKey:SenderID;references:ID"`
}
