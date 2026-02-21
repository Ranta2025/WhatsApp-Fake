package models

import (
	"encoding/json"
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

	// Campos para responder mensajes
	ReplyToMessageID *uint   `gorm:"index"`                     // ID del mensaje al que responde (nullable)
	ReplyToTelephon  *string `gorm:"column:reply_to_username;size:50"`  // Número de teléfono del autor del mensaje original (columna legacy: reply_to_username)
	ReplyToMessage   *string `gorm:"size:400"`                  // Texto del mensaje original (copia para mostrar)

	User        UserDataBase `gorm:"foreignKey:IdUser;references:ID"`
	UserContact UserDataBase `gorm:"foreignKey:IdReceptor;references:ID"`
}

type MessageCreat struct {
	MessageGet
	Telephon string // Número de teléfono del remitente
}

type BaseMessage struct {
	Type    string          `json:"type"`    // "chat", "contact", "auth"
	Payload json.RawMessage `json:"payload"` // El contenido específico
}
