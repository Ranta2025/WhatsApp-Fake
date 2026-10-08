package models

import (
	"time"

	"gorm.io/gorm"
)

type User struct {
	gorm.Model
	Username string `gorm:"size:30;unique" json:"username" binding:"required"`
	Gmail    string `gorm:"unique" json:"email" binding:"required,email"`
	Telephon string `gorm:"unique;size:20" json:"telephon" binding:"required,e164"`
}

type UserDataBase struct {
	User
	Password     string     `gorm:"size:100" json:"password" binding:"required"`
	Activo       bool       `gorm:"default:false"`
	Bloqueado    bool       `gorm:"default:false"`
	LastSeen     *time.Time `gorm:"column:last_seen" json:"lastSeen"`
	AvatarUrl    string     `gorm:"size:500" json:"avatarUrl"`
	WallpaperUrl string     `gorm:"size:500" json:"wallpaperUrl"`
	// PushPreviewDisabled=true hace que las notificaciones push de este usuario
	// lleven un cuerpo genérico, sin el texto del mensaje. El valor cero
	// (false = preview activada) evita migrar las filas existentes.
	PushPreviewDisabled bool `gorm:"not null;default:false" json:"-"`

	ContactsAdded         []ContactDataBase `gorm:"foreignKey:IdUser"`
	ContactsWhereIAmAdded []ContactDataBase `gorm:"foreignKey:IdContact"`

	MessageAdd           []Message `gorm:"foreignKey:IdUser"`
	MessageWhereIAmAdded []Message `gorm:"foreignKey:IdReceptor"`
}

// UserAuth agrupa los datos necesarios para autenticar/autorizar a un usuario
// (se obtienen en una sola consulta en vez de una por campo).
type UserAuth struct {
	Username  string
	Telephon  string
	Gmail     string
	Password  string
	Activo    bool
	Bloqueado bool
}

// UserBasic son los datos públicos mínimos de un usuario (sin password ni email),
// usados para resolver remitentes/receptores en listados.
type UserBasic struct {
	ID        uint
	Telephon  string
	Username  string
	AvatarUrl string
}
