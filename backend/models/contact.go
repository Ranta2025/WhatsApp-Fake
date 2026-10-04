package models

import (
	"time"

	"gorm.io/gorm"
)

// Valores de ContactDataBase.Status (CHECK chk_contacts_status). No existe un
// estado "blocked": la fila del receptor hacia el remitente en "rejected" es
// la forma de bloquearlo (queda fuera de sus listados).
const (
	ContactStatusPending  = "pending"
	ContactStatusAccepted = "accepted"
	ContactStatusRejected = "rejected"
)

type ContactDataBase struct {
	gorm.Model
	IdUser       uint   `gorm:"not null" json:"id_user" binding:"required"`
	IdContact    uint   `gorm:"not null" json:"id_contact" binding:"required"`
	Status       string `gorm:"size:25;not null"`
	ContactName  string `gorm:"size:100"` // Nombre personalizado que el usuario le pone al contacto
	WallpaperUrl string `gorm:"size:500"` // Fondo de pantalla específico para este chat

	User        UserDataBase `gorm:"foreignKey:IdUser;references:ID"`
	UserContact UserDataBase `gorm:"foreignKey:IdContact;references:ID"`
}

type ContactChat struct {
	Username     string
	Number       string
	Status       string
	ContactName  string     // Nombre personalizado del contacto
	LastSeen     *time.Time `json:"last_seen"`     // Última vez que el contacto estuvo en línea
	AvatarUrl    string     `json:"avatar_url"`    // URL de la foto de perfil
	WallpaperUrl string     `json:"wallpaper_url"` // URL del fondo de pantalla específico

	// Silencio del chat para el usuario que consulta (lo rellena el listado
	// GET /contact; no son columnas). Muted se omite si es false; MutedUntil
	// se omite si no hay silencio o si es "para siempre".
	Muted      bool       `json:"Muted,omitempty" gorm:"-"`
	MutedUntil *time.Time `json:"MutedUntil,omitempty" gorm:"-"`
}

type ContactPut struct {
	Number string
	GetContactPut
}
