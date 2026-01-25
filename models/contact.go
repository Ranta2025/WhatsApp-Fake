package models

import "gorm.io/gorm"

type Contact struct {
	Number string `json:"number" binding:"required"`
}

type ContactDataBase struct {
	gorm.Model
	IdUser    uint   `gorm:"not null" json:"id_user" binding:"required"`
	IdContact uint   `gorm:"not null" json:"id_contact" binding:"required"`
	Status    string `gorm:"size:15;not null"`

	User        UserDataBase `gorm:"foreignKey:IdUser;references:ID"`
	UserContact UserDataBase `gorm:"foreignKey:IdContact;references:ID"`
}

type ContactChat struct {
	Username string
	Number   string
	Status   string
}
