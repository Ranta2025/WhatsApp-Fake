package models

import (
	"encoding/json"
	"errors"
	"time"

	"gorm.io/gorm"
)

// ErrMessageNotFound lo devuelve el repositorio cuando el mensaje no existe o no
// es visible para el usuario que lo consulta.
var ErrMessageNotFound = errors.New("mensaje no encontrado")

// ErrUserNotFound lo devuelve el repositorio cuando no existe ningún usuario con
// el teléfono consultado (distinto de un fallo de infraestructura).
var ErrUserNotFound = errors.New("id usuario no encontrado")

type Message struct {
	gorm.Model
	IdUser     uint      `gorm:"index"`
	IdReceptor uint      `gorm:"index"`
	Message    string    `gorm:"size:400;not null"`
	Status     string    `gorm:"size:15;not null"`
	Time       time.Time `gorm:"not null"`

	Edited bool `gorm:"default:false"` // true si el mensaje fue editado

	DeletedBySender   bool `gorm:"default:false"` // true si el remitente vació el chat
	DeletedByReceiver bool `gorm:"default:false"` // true si el receptor vació el chat

	// Campos de media (foto, audio, video)
	MediaUrl  string `gorm:"size:500"` // URL del archivo en MinIO (vacío si es mensaje de texto)
	MediaType string `gorm:"size:20"`  // "image", "audio", "video", "sticker"

	// Campos para responder mensajes
	ReplyToMessageID *uint   `gorm:"index"`                            // ID del mensaje al que responde (nullable)
	ReplyToTelephon  *string `gorm:"column:reply_to_telephon;size:50"` // Número de teléfono del autor del mensaje original
	ReplyToMessage   *string `gorm:"size:400"`                         // Texto del mensaje original (copia para mostrar)

	// Mensajes de sistema 1:1 (p. ej. cambio de mensajes temporales): Kind ""
	// = mensaje normal, "system" = evento. Message guarda el valor nuevo.
	Kind        string `gorm:"size:20;not null;default:''"`
	SystemEvent string `gorm:"size:40;not null;default:''"`

	// ExpiresAt es el instante de expiración (nil = no expira). Se fija al crear.
	ExpiresAt *time.Time

	// ClientID is the sender-generated idempotency key (lowercase UUID, nil when
	// absent). Unique per sender through a partial index (see database/postgres.go).
	ClientID *string `gorm:"size:36"`

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
