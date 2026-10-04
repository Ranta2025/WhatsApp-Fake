package schemas

import "time"

type Message struct {
	MessageID      uint      `json:"MessageID"`
	SenderTelephon string    `json:"SenderTelephon"` // Número de teléfono del remitente
	Receptor       string    `json:"Receptor"`       // Número de teléfono del receptor
	Message        string    `json:"Message"`
	Status         string    `json:"Status"`
	Time           time.Time `json:"Time"`

	Edited bool `json:"Edited"` // true si el mensaje fue editado

	// Campos de media
	MediaUrl  string `json:"MediaUrl,omitempty"`  // URL del archivo en MinIO
	MediaType string `json:"MediaType,omitempty"` // "image", "audio", "video", "sticker"

	// Campos para responder mensajes
	ReplyToMessageID *uint   `json:"ReplyToMessageID,omitempty"`
	ReplyToTelephon  *string `json:"ReplyToTelephon,omitempty"` // Número de teléfono del autor del mensaje original
	ReplyToMessage   *string `json:"ReplyToMessage,omitempty"`

	// Agregados de reacciones para el espectador; se omite si no hay ninguna.
	Reactions []ReactionSummary `json:"Reactions,omitempty"`

	// Mensajes temporales (PascalCase por regla cross-feature). ExpiresAt solo
	// existe si el chat tenía temporizador al enviar; Kind="system" marca los
	// mensajes de sistema y SystemEvent el evento (p. ej. disappearing_changed).
	ExpiresAt   *time.Time `json:"ExpiresAt,omitempty"`
	Kind        string     `json:"Kind,omitempty"`
	SystemEvent string     `json:"SystemEvent,omitempty"`

	// ClientID echoes the sender's idempotency key so the client can reconcile
	// its optimistic copy; receivers may see it too (it is an opaque UUID).
	ClientID *string `json:"ClientID,omitempty"`

	// Duplicate marks a replayed send that returned the stored message. It is a
	// transport hint for handlers (skip re-broadcast) and is never serialized.
	Duplicate bool `json:"-"`
}

// ChatGroup agrupa todos los mensajes de una conversación con un contacto.
// IsContact indica si el otro participante está en la lista de contactos del usuario.
// Si IsContact=false el front debe mostrar las opciones "Agregar" / "Bloquear".
type ChatGroup struct {
	ContactTelephon  string    `json:"ContactTelephon"`  // Número del otro participante
	ContactUsername  string    `json:"ContactUsername"`  // Username del otro participante
	ContactName      string    `json:"ContactName"`      // Nombre personalizado (vacío si no está agregado)
	ContactAvatarUrl string    `json:"ContactAvatarUrl"` // URL del avatar del otro participante
	IsContact        bool      `json:"IsContact"`        // true = está en la lista de contactos
	Messages         []Message `json:"Messages"`
	DisappearSeconds int       `json:"DisappearSeconds,omitempty"` // temporizador del chat (0 = off)

	// Silencio del chat para el usuario que consulta (PascalCase por la regla
	// cross-feature). Muted se omite si es false; MutedUntil se omite si no
	// hay silencio o si es "para siempre" (Muted=true sin MutedUntil). Los
	// silencios vencidos salen como no silenciados.
	Muted      bool       `json:"Muted,omitempty"`
	MutedUntil *time.Time `json:"MutedUntil,omitempty"`
}
