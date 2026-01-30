package models

import (
	"time"

	"gorm.io/gorm"
)

type Message struct {
	gorm.Model
	IdUser     uint      `gorm:"index"`
	IdReceptor uint      `gorm:"index"`
	Message    string    `gorm:"size:400;not null"`
	Status     string    `gorm:"size:15;not null"`
	Time       time.Time `gorm:"not null"`

	User        UserDataBase `gorm:"foreignKey:IdUser;references:ID"`
	UserContact UserDataBase `gorm:"foreignKey:IdReceptor;references:ID"`
}

type MessageCreat struct {
	MessageGet
	Username string
}
