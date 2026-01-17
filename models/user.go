package models

import "gorm.io/gorm"

type User struct {
	gorm.Model
	Username string `gorm:"size:30;unique"`
	Gmail    string `gorm:"unique"`
}

type UserDataBase struct{
	User
	Password string `gorm:"size:45"`
	Activo bool `gorm:"default:true"`
}

type UserLogin struct {
	Username string
	Password string
}