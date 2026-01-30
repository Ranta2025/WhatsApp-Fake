package models

import "gorm.io/gorm"

type User struct {
	gorm.Model
	Username string `gorm:"size:30;unique" json:"username" binding:"required"`
	Gmail    string `gorm:"unique" json:"email" binding:"required,email"`
	Telephon string `gorm:"unique;size:8" json:"numero" binding:"required"`
}

type UserDataBase struct{
	User
	Password string `gorm:"size:70" json:"password" binding:"required"`
	Activo bool `gorm:"default:true"`

	ContactsAdded []ContactDataBase `gorm:"foreignKey:IdUser"`
	ContactsWhereIAmAdded []ContactDataBase `gorm:"foreignKey:IdContact"`

	MessageAdd []Message `gorm:"foreignKey:IdUser"`
	MessageWhereIAmAdded []Message `gorm:"foreignKey:IdReceptor"`
}


