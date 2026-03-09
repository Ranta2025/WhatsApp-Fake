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
	Message  string `json:"message"`

	// Campos de media
	MediaUrl  string `json:"mediaUrl,omitempty"`  // URL del archivo en MinIO
	MediaType string `json:"mediaType,omitempty"` // "image", "audio", "video", "sticker"

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

// ─────────────────────────────────────────────────────────────────────────
// Group models
// ─────────────────────────────────────────────────────────────────────────

// GroupCreate es el body para crear un nuevo grupo.
// Members es la lista de teléfonos (E.164) de los contactos a añadir como miembros iniciales.
type GroupCreate struct {
	Name        string   `json:"name" binding:"required"`
	Description string   `json:"description,omitempty"`
	Members     []string `json:"members" binding:"required,min=1"`
}

// GroupAddMembers añade nuevos miembros a un grupo existente.
type GroupAddMembers struct {
	Members []string `json:"members" binding:"required,min=1"`
}

// GroupMessageSend es el payload de un nuevo mensaje de grupo (HTTP y WebSocket).
type GroupMessageSend struct {
	GroupID   uint   `json:"groupID" binding:"required"`
	Message   string `json:"message"`
	MediaUrl  string `json:"mediaUrl,omitempty"`
	MediaType string `json:"mediaType,omitempty"`

	ReplyToMessageID *uint   `json:"replyToMessageID,omitempty"`
	ReplyToTelephon  *string `json:"replyToTelephon,omitempty"`
	ReplyToMessage   *string `json:"replyToMessage,omitempty"`
}

// GroupMessageEdit solicita editar el contenido de un mensaje de grupo.
type GroupMessageEdit struct {
	MessageID uint   `json:"messageID" binding:"required"`
	Message   string `json:"message" binding:"required"`
}

// GroupMessageDelete solicita eliminar (soft-delete) un mensaje de grupo.
type GroupMessageDelete struct {
	MessageID uint `json:"messageID" binding:"required"`
}

// GroupSetRole cambia el rol de un miembro dentro de un grupo.
// Solo un admin puede ejecutar esta operación.
type GroupSetRole struct {
	Number string `json:"number" binding:"required,e164"` // teléfono E.164 del miembro objetivo
	Role   string `json:"role"   binding:"required"`      // "admin" | "member"
}

// GroupRemoveMember solicita eliminar a un miembro del grupo.
// Solo un admin puede ejecutar esta operación; no puede usarse para eliminarse a uno mismo.
type GroupRemoveMember struct {
	Number string `json:"number" binding:"required,e164"` // teléfono E.164 del miembro a eliminar
}

// GroupUpdateDescription actualiza la descripción de un grupo. Solo admins.
type GroupUpdateDescription struct {
	Description string `json:"description" binding:"max=300"`
}

// GroupTyping indica que un miembro está escribiendo en un grupo.
type GroupTyping struct {
	GroupID uint `json:"groupID" binding:"required"`
}

type StatusCreate struct {
	Text       string `json:"text,omitempty"`
	MediaUrl   string `json:"mediaUrl,omitempty"`
	MediaType  string `json:"mediaType,omitempty"`
	Background string `json:"background,omitempty"`
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

// GroupCallOffer se envía cuando un usuario inicia una llamada a todo el grupo.
type GroupCallOffer struct {
	GroupID  uint   `json:"groupID" binding:"required"`
	RoomID   string `json:"roomID" binding:"required"`
	CallType string `json:"callType" binding:"required"` // "video" o "audio"
}

// GroupCallEnd se envía cuando alguien finaliza/abandona una llamada grupal.
type GroupCallEnd struct {
	GroupID uint   `json:"groupID" binding:"required"`
	RoomID  string `json:"roomID" binding:"required"`
}
