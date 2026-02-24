package models

type UserLogin struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type Username struct {
	Username string `json:"username"`
}

type ContactAdd struct {
	Number      string `json:"number" binding:"required,e164"`  // Número de teléfono del contacto (formato internacional: +502...)
	ContactName string `json:"contact_name" binding:"required"` // Nombre que le quieres poner al contacto
}

type MessageGet struct {
	Receptor string `json:"receptor" binding:"required"` // Número de teléfono del receptor
	Message  string `json:"message" binding:"required"`

	// Campos para responder mensajes
	ReplyToMessageID *uint   `json:"replyToMessageID,omitempty"`
	ReplyToTelephon  *string `json:"replyToTelephon,omitempty"` // Número de teléfono del autor del mensaje original
	ReplyToMessage   *string `json:"replyToMessage,omitempty"`
}

type MessageEdit struct {
	MessageID uint   `json:"messageID" binding:"required"`
	Receptor  string `json:"receptor" binding:"required"` // Número de teléfono del receptor (para notificarle)
	Message   string `json:"message" binding:"required"`  // Nuevo contenido del mensaje
}

type MessageDelete struct {
	MessageID uint   `json:"messageID" binding:"required"`
	Receptor  string `json:"receptor" binding:"required"`
}

type MessageRead struct {
	From string `json:"from" binding:"required"` // Número de teléfono del remitente
}

type TypingIndicator struct {
	To string `json:"to" binding:"required"` // Número de teléfono del receptor
}

type UserActivate struct {
	Username string `json:"username" binding:"required"`
	Code     string `json:"code" binding:"required"`
}

type UserRecover struct {
	Email string `json:"email" binding:"required"`
	Code  string `json:"code" binding:"required"`
}

type UserChangePassword struct {
	Gmail    string `json:"gmail" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type UserRecoverAndChange struct {
	Email    string `json:"email" binding:"required"`
	Code     string `json:"code" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type UserForgotPassword struct {
	Email    string `json:"email" binding:"required"`
	Code     string `json:"code" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type GetContactPut struct {
	Number      string `json:"number" binding:"required,e164"`
	ContactName string `json:"contact_name" binding:"required"`
}

// Call signaling models
type CallOffer struct {
	To       string `json:"to" binding:"required"`       // Teléfono del receptor
	RoomID   string `json:"roomID" binding:"required"`   // ID de la sala de ZegoCloud
	CallType string `json:"callType" binding:"required"` // "video" o "audio"
}

type CallResponse struct {
	To     string `json:"to" binding:"required"`     // Teléfono del que llamó
	RoomID string `json:"roomID" binding:"required"` // ID de la sala
}

type CallEnd struct {
	To     string `json:"to" binding:"required"`
	RoomID string `json:"roomID" binding:"required"`
}
