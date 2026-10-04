package schemas

import "time"

// StatusItem es un estado individual devuelto al cliente.
type StatusItem struct {
	ID              uint      `json:"ID"`
	Type            string    `json:"Type"`
	Text            string    `json:"Text,omitempty"`
	BackgroundColor string    `json:"BackgroundColor,omitempty"`
	MediaUrl        string    `json:"MediaUrl,omitempty"`
	Caption         string    `json:"Caption,omitempty"`
	CreatedAt       time.Time `json:"CreatedAt"`
	ExpiresAt       time.Time `json:"ExpiresAt"`
	Viewed          bool      `json:"Viewed"`
	ViewCount       int64     `json:"ViewCount"` // solo tiene sentido en "mine" (siempre 0 en estados de contactos)
}

// StatusOwnerBrief son los datos públicos mínimos del dueño de un estado,
// usados tanto en la respuesta REST (agrupación por contacto) como en los
// eventos de WebSocket.
type StatusOwnerBrief struct {
	Telephon    string `json:"Telephon"`
	Username    string `json:"Username"`
	ContactName string `json:"ContactName,omitempty"`
	AvatarUrl   string `json:"AvatarUrl,omitempty"`
}

// StatusContactGroup agrupa los estados activos de un contacto mutuo.
type StatusContactGroup struct {
	StatusOwnerBrief
	Statuses    []StatusItem `json:"Statuses"`
	AllViewed   bool         `json:"AllViewed"`
	LastUpdated time.Time    `json:"LastUpdated"`
}

// StatusFeed es la respuesta de GET /api/v1/status.
type StatusFeed struct {
	Mine     []StatusItem         `json:"Mine"`
	Contacts []StatusContactGroup `json:"Contacts"`
}

// StatusViewer es una entrada de la lista de "quién vio mi estado".
type StatusViewer struct {
	Telephon  string    `json:"Telephon"`
	Username  string    `json:"Username"`
	AvatarUrl string    `json:"AvatarUrl,omitempty"`
	ViewedAt  time.Time `json:"ViewedAt"`
}
