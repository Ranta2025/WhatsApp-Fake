package models

import (
	"time"

	"gorm.io/gorm"
)

type User struct {
	gorm.Model
	Username string `gorm:"size:30;unique" json:"username" binding:"required"`
	Gmail    string `gorm:"unique" json:"email" binding:"required,email"`
	Telephon string `gorm:"unique;size:20" json:"numero" binding:"required,e164"`
}

type UserDataBase struct {
	User
	Password  string     `gorm:"size:70" json:"password" binding:"required"`
	Activo    bool       `gorm:"default:false"`
	Bloqueado bool       `gorm:"default:false"`
	LastSeen  *time.Time `gorm:"column:last_seen" json:"last_seen"`
	AvatarUrl string     `gorm:"size:500" json:"avatar_url"`

	ContactsAdded         []ContactDataBase `gorm:"foreignKey:IdUser"`
	ContactsWhereIAmAdded []ContactDataBase `gorm:"foreignKey:IdContact"`

	MessageAdd           []Message `gorm:"foreignKey:IdUser"`
	MessageWhereIAmAdded []Message `gorm:"foreignKey:IdReceptor"`
}
