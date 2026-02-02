package models

import "time"

// Tipos de mensajes WebSocket
const (
	MessageTypeChat           = "chat"            // Mensaje de chat normal
	MessageTypeDelivered      = "delivered"       // Confirmación de entrega
	MessageTypeRead           = "read"            // Confirmación de lectura
	MessageTypeTyping         = "typing"          // Usuario escribiendo
	MessageTypeOnline         = "online"          // Usuario conectado
	MessageTypeOffline        = "offline"         // Usuario desconectado
	MessageTypeContactList    = "contact_list"    // Lista de contactos online
	MessageTypeContactRequest = "contact_request" // Nueva solicitud de contacto
	MessageTypeContactAccept  = "contact_accept"  // Contacto aceptado
	MessageTypeContactReject  = "contact_reject"  // Contacto rechazado
)

// Estados de mensaje
const (
	StatusSent      = "enviado"
	StatusDelivered = "entregado"
	StatusRead      = "visto"
)

// WSMessage representa un mensaje WebSocket
type WSMessage struct {
	Type      string    `json:"type"`
	From      string    `json:"from"`
	To        string    `json:"to"`
	Message   string    `json:"message,omitempty"`
	Status    string    `json:"status,omitempty"`
	Timestamp time.Time `json:"timestamp"`
	MessageID uint      `json:"message_id,omitempty"`
}

// WSResponse representa una respuesta del servidor
type WSResponse struct {
	Type    string      `json:"type"`
	Success bool        `json:"success"`
	Message string      `json:"message,omitempty"`
	Data    interface{} `json:"data,omitempty"`
}

// WSContactStatus representa el estado de un contacto
type WSContactStatus struct {
	Username string `json:"username"`
	Online   bool   `json:"online"`
}

// WSContactList lista de contactos con su estado
type WSContactList struct {
	Type     string            `json:"type"`
	Contacts []WSContactStatus `json:"contacts"`
}

// WSContactEvent evento de cambio en contactos
type WSContactEvent struct {
	Type      string    `json:"type"`
	From      string    `json:"from"`
	To        string    `json:"to"`
	Username  string    `json:"username,omitempty"`
	Number    string    `json:"number,omitempty"`
	Status    string    `json:"status,omitempty"` // "pending", "accepted", "rejected"
	Timestamp time.Time `json:"timestamp"`
}
