package schemas

import "time"

// GroupResponse contiene los datos básicos de un grupo para listados.
type GroupResponse struct {
	ID              uint      `json:"ID"`
	Name            string    `json:"Name"`
	Description     string    `json:"Description,omitempty"`
	AvatarUrl       string    `json:"AvatarUrl,omitempty"`
	CreatorTelephon string    `json:"CreatorTelephon"`
	MemberCount     int       `json:"MemberCount"`
	UserRole        string    `json:"UserRole"` // rol del usuario que hace la petición: "admin" | "member"
	CreatedAt       time.Time `json:"CreatedAt"`
}

// GroupMemberResponse son los datos de un miembro dentro de un grupo,
// incluyendo el nombre personalizado del contacto si lo tiene.
type GroupMemberResponse struct {
	Telephon    string `json:"Telephon"`
	Username    string `json:"Username"`
	AvatarUrl   string `json:"AvatarUrl,omitempty"`
	Role        string `json:"Role"`                  // "admin" | "member"
	ContactName string `json:"ContactName,omitempty"` // nombre personalizado (si lo tienen como contacto)
}

// GroupMessageResponse es un mensaje de grupo serializado para la API y WebSocket.
type GroupMessageResponse struct {
	MessageID      uint      `json:"MessageID"`
	GroupID        uint      `json:"GroupID"`
	SenderTelephon string    `json:"SenderTelephon"`
	SenderUsername string    `json:"SenderUsername"`
	Message        string    `json:"Message"`
	Time           time.Time `json:"Time"`
	Edited         bool      `json:"Edited"`

	MediaUrl  string `json:"MediaUrl,omitempty"`
	MediaType string `json:"MediaType,omitempty"`

	ReplyToMessageID *uint   `json:"ReplyToMessageID,omitempty"`
	ReplyToTelephon  *string `json:"ReplyToTelephon,omitempty"`
	ReplyToMessage   *string `json:"ReplyToMessage,omitempty"`
}

// GroupDetail combina la info completa del grupo: metadatos, miembros y mensajes.
// Devuelto por GET /api/v1/group/:groupID.
type GroupDetail struct {
	GroupResponse
	Members  []GroupMemberResponse  `json:"Members"`
	Messages []GroupMessageResponse `json:"Messages"`
}
