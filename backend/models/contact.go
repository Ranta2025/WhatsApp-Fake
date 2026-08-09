package models

import (
	"time"

	"gorm.io/gorm"
)

type ContactDataBase struct {
	gorm.Model
	IdUser       uint   `gorm:"uniqueIndex:idx_contact_pair;not null" json:"id_user"`
	IdContact    uint   `gorm:"uniqueIndex:idx_contact_pair;not null" json:"id_contact"`
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
}

type ContactPut struct {
	Number string
	GetContactPut
}
