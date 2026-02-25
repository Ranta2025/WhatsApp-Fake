package models

import (
	"time"

	"gorm.io/gorm"
)

type ContactDataBase struct {
	gorm.Model
	IdUser      uint   `gorm:"not null" json:"id_user" binding:"required"`
	IdContact   uint   `gorm:"not null" json:"id_contact" binding:"required"`
	Status      string `gorm:"size:25;not null"`
	ContactName string `gorm:"size:100"` // Nombre personalizado que el usuario le pone al contacto

	User        UserDataBase `gorm:"foreignKey:IdUser;references:ID"`
	UserContact UserDataBase `gorm:"foreignKey:IdContact;references:ID"`
}

type ContactChat struct {
	Username    string
	Number      string
	Status      string
	ContactName string     // Nombre personalizado del contacto
	LastSeen    *time.Time `json:"last_seen"`  // Última vez que el contacto estuvo en línea
	AvatarUrl   string     `json:"avatar_url"` // URL de la foto de perfil
}

type ContactPut struct {
	Number string
	GetContactPut
}
