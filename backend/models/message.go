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
	Status     string    `gorm:"size:15;not null"` // valid values: 'enviado', 'entregado', 'visto'
	SentAt     time.Time `gorm:"column:sent_at;not null;index"`

	Edited bool `gorm:"default:false"` // true si el mensaje fue editado

	DeletedBySender   bool `gorm:"default:false"` // true si el remitente vació el chat
	DeletedByReceiver bool `gorm:"default:false"` // true si el receptor vació el chat

	// Campos de media (foto, audio, video)
	MediaUrl  string `gorm:"size:2048"` // URL del archivo en MinIO (vacío si es mensaje de texto)
	MediaType string `gorm:"size:20"`   // "image", "audio", "video", "sticker"

	// Campos para responder mensajes
	ReplyToMessageID *uint   `gorm:"index"`                            // ID del mensaje al que responde (nullable)
	ReplyToTelephon  *string `gorm:"column:reply_to_telephon;size:50"` // Número de teléfono del autor del mensaje original
	ReplyToMessage   *string `gorm:"size:400"`                         // Texto del mensaje original (copia para mostrar)

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
