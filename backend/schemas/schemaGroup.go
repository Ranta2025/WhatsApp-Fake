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

	// Configuración de permisos del grupo (PascalCase por regla cross-feature:
	// campos añadidos dentro de un schema PascalCase existente).
	OnlyAdminsCanSend       bool `json:"OnlyAdminsCanSend"`
	OnlyAdminsCanEditInfo   bool `json:"OnlyAdminsCanEditInfo"`
	OnlyAdminsCanAddMembers bool `json:"OnlyAdminsCanAddMembers"`
}

// GroupMemberResponse son los datos de un miembro dentro de un grupo,
// incluyendo el nombre personalizado del contacto si lo tiene.
type GroupMemberResponse struct {
	Telephon    string `json:"Telephon"`
	Username    string `json:"Username"`
	AvatarUrl   string `json:"AvatarUrl,omitempty"`
	Role        string `json:"Role"`                  // "admin" | "member"
	ContactName string `json:"ContactName,omitempty"` // nombre personalizado (si lo tienen como contacto)

	// Marcas de agua de acuses del miembro (ids de mensaje dentro de este grupo).
	// Permiten al cliente derivar los ticks de cualquier página cargada.
	JoinedMessageID        uint `json:"JoinedMessageID,omitempty"`
	LastDeliveredMessageID uint `json:"LastDeliveredMessageID,omitempty"`
	LastReadMessageID      uint `json:"LastReadMessageID,omitempty"`
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

// GroupReceiptUpdate es el evento `group_receipt` (WS) que avisa a los miembros
// de que las marcas de agua de `Telephon` avanzaron en el grupo.
type GroupReceiptUpdate struct {
	GroupID       uint   `json:"groupID"`
	Telephon      string `json:"telephon"`
	DeliveredUpTo uint   `json:"deliveredUpTo"`
	ReadUpTo      uint   `json:"readUpTo"`
}

// GroupMemberBrief es la ficha mínima de un miembro en la lista de acuses.
type GroupMemberBrief struct {
	Telephon  string `json:"telephon"`
	Username  string `json:"username"`
	AvatarUrl string `json:"avatarUrl,omitempty"`
}

// GroupMessageReceipts reparte a los miembros elegibles según el acuse de un
// mensaje: ReadBy (leído), DeliveredTo (entregado pero no leído) y Pending
// (aún sin entregar). Solo lo puede consultar el autor del mensaje.
type GroupMessageReceipts struct {
	ReadBy      []GroupMemberBrief `json:"readBy"`
	DeliveredTo []GroupMemberBrief `json:"deliveredTo"`
	Pending     []GroupMemberBrief `json:"pending"`
}
