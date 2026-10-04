package models

import (
	"time"

	"gorm.io/gorm"
)

// Status es una publicación efímera de un usuario (como los "Estados" de
// WhatsApp): texto con color de fondo, imagen o video con leyenda opcional.
// Expira 24h después de crearse (ExpiresAt), momento en el que el job de
// limpieza periódico la borra junto con sus vistas.
type Status struct {
	gorm.Model
	UserID          uint      `gorm:"not null;index"`
	Type            string    `gorm:"size:10;not null"` // "text" | "image" | "video"
	Text            string    `gorm:"size:700"`
	BackgroundColor string    `gorm:"size:7"` // "#RRGGBB", solo aplica a type=text
	MediaUrl        string    `gorm:"size:500"`
	Caption         string    `gorm:"size:700"`
	ExpiresAt       time.Time `gorm:"not null;index"`

	User  UserDataBase `gorm:"foreignKey:UserID;references:ID"`
	Views []StatusView `gorm:"foreignKey:StatusID"`
}

// StatusView registra que un contacto vio un estado. Es único por
// (status_id, viewer_id): ver dos veces el mismo estado no crea duplicados.
type StatusView struct {
	gorm.Model
	StatusID uint      `gorm:"not null;index"`
	ViewerID uint      `gorm:"not null;index"`
	ViewedAt time.Time `gorm:"not null"`

	StatusEntry Status       `gorm:"foreignKey:StatusID;references:ID"`
	Viewer      UserDataBase `gorm:"foreignKey:ViewerID;references:ID"`
}

// StatusCreate es el body para publicar un nuevo estado.
type StatusCreate struct {
	Type            string `json:"type" binding:"required"` // "text" | "image" | "video"
	Text            string `json:"text,omitempty"`
	BackgroundColor string `json:"backgroundColor,omitempty"`
	MediaUrl        string `json:"mediaUrl,omitempty"`
	Caption         string `json:"caption,omitempty"`
}
