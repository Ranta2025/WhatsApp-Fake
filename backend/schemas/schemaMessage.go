package schemas

import "time"

type Message struct {
	MessageID      uint      `json:"messageID"`
	SenderTelephon string    `json:"senderTelephon"` // Número de teléfono del remitente
	Receptor       string    `json:"receptor"`       // Número de teléfono del receptor
	Message        string    `json:"message"`
	Status         string    `json:"status"`
	Time           time.Time `json:"time"`

	Edited bool `json:"edited"` // true si el mensaje fue editado

	// Campos de media
	MediaUrl  string `json:"mediaUrl,omitempty"`  // URL del archivo en MinIO
	MediaType string `json:"mediaType,omitempty"` // "image", "audio", "video", "sticker"

	// Campos para responder mensajes
	ReplyToMessageID *uint   `json:"replyToMessageID,omitempty"`
	ReplyToTelephon  *string `json:"replyToTelephon,omitempty"` // Número de teléfono del autor del mensaje original
	ReplyToMessage   *string `json:"replyToMessage,omitempty"`

	// Agregados de reacciones para el espectador; se omite si no hay ninguna.
	Reactions []ReactionSummary `json:"reactions,omitempty"`

	// Mensajes temporales (camelCase nativo desde AC4). ExpiresAt solo existe si
	// el chat tenía temporizador al enviar; Kind="system" marca los mensajes de
	// sistema y SystemEvent el evento (p. ej. disappearing_changed).
	ExpiresAt   *time.Time `json:"expiresAt,omitempty"`
	Kind        string     `json:"kind,omitempty"`
	SystemEvent string     `json:"systemEvent,omitempty"`

	// ClientID echoes the sender's idempotency key so the client can reconcile
	// its optimistic copy; receivers may see it too (it is an opaque UUID).
	ClientID *string `json:"clientID,omitempty"`

	// Duplicate marks a replayed send that returned the stored message. It is a
	// transport hint for handlers (skip re-broadcast) and is never serialized.
	Duplicate bool `json:"-"`
}

// ChatGroup agrupa todos los mensajes de una conversación con un contacto.
// IsContact indica si el otro participante está en la lista de contactos del usuario.
// Si IsContact=false el front debe mostrar las opciones "Agregar" / "Bloquear".
type ChatGroup struct {
	ContactTelephon  string    `json:"contactTelephon"`  // Número del otro participante
	ContactUsername  string    `json:"contactUsername"`  // Username del otro participante
	ContactName      string    `json:"contactName"`      // Nombre personalizado (vacío si no está agregado)
	ContactAvatarUrl string    `json:"contactAvatarUrl"` // URL del avatar del otro participante
	IsContact        bool      `json:"isContact"`        // true = está en la lista de contactos
	Messages         []Message `json:"messages"`
	DisappearSeconds int       `json:"disappearSeconds,omitempty"` // temporizador del chat (0 = off)

	// Silencio del chat para el usuario que consulta (camelCase nativo desde AC4).
	// Muted se omite si es false; MutedUntil se omite si no hay silencio o si es
	// "para siempre" (Muted=true sin MutedUntil). Los silencios vencidos salen
	// como no silenciados.
	Muted      bool       `json:"muted,omitempty"`
	MutedUntil *time.Time `json:"mutedUntil,omitempty"`
}
