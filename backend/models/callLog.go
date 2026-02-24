package models

import (
	"time"

	"gorm.io/gorm"
)

// CallLog registra el historial de llamadas (como WhatsApp)
type CallLog struct {
	gorm.Model
	CallerID   uint       `gorm:"index;not null"`                    // ID del que inicia la llamada
	ReceiverID uint       `gorm:"index;not null"`                    // ID del que recibe la llamada
	RoomID     string     `gorm:"size:100;not null"`                 // ID de la sala de ZegoCloud
	CallType   string     `gorm:"size:10;not null;default:'video'"`  // "video" o "audio"
	Status     string     `gorm:"size:20;not null;default:'missed'"` // "answered", "missed", "rejected", "unavailable"
	StartedAt  time.Time  `gorm:"not null"`                          // Cuando se inició la llamada
	AnsweredAt *time.Time // Cuando se contestó (null si no se contestó)
	EndedAt    *time.Time // Cuando terminó la llamada
	Duration   int        `gorm:"default:0"` // Duración en segundos

	// Flags de borrado individual (como los mensajes)
	DeletedByCaller   bool `gorm:"default:false"`
	DeletedByReceiver bool `gorm:"default:false"`

	Caller   UserDataBase `gorm:"foreignKey:CallerID;references:ID"`
	Receiver UserDataBase `gorm:"foreignKey:ReceiverID;references:ID"`
}
