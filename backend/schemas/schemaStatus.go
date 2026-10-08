package schemas

import "time"

// StatusItem es un estado individual devuelto al cliente.
type StatusItem struct {
	ID              uint      `json:"id"`
	Type            string    `json:"type"`
	Text            string    `json:"text,omitempty"`
	BackgroundColor string    `json:"backgroundColor,omitempty"`
	MediaUrl        string    `json:"mediaUrl,omitempty"`
	Caption         string    `json:"caption,omitempty"`
	CreatedAt       time.Time `json:"createdAt"`
	ExpiresAt       time.Time `json:"expiresAt"`
	Viewed          bool      `json:"viewed"`
	ViewCount       int64     `json:"viewCount"` // solo tiene sentido en "mine" (siempre 0 en estados de contactos)
}

// StatusOwnerBrief son los datos públicos mínimos del dueño de un estado,
// usados tanto en la respuesta REST (agrupación por contacto) como en los
// eventos de WebSocket.
type StatusOwnerBrief struct {
	Telephon    string `json:"telephon"`
	Username    string `json:"username"`
	ContactName string `json:"contactName,omitempty"`
	AvatarUrl   string `json:"avatarUrl,omitempty"`
}

// StatusContactGroup agrupa los estados activos de un contacto mutuo.
type StatusContactGroup struct {
	StatusOwnerBrief
	Statuses    []StatusItem `json:"statuses"`
	AllViewed   bool         `json:"allViewed"`
	LastUpdated time.Time    `json:"lastUpdated"`
}

// StatusFeed es la respuesta de GET /api/v1/status.
type StatusFeed struct {
	Mine     []StatusItem         `json:"mine"`
	Contacts []StatusContactGroup `json:"contacts"`
}

// StatusViewer es una entrada de la lista de "quién vio mi estado".
type StatusViewer struct {
	Telephon  string    `json:"telephon"`
	Username  string    `json:"username"`
	AvatarUrl string    `json:"avatarUrl,omitempty"`
	ViewedAt  time.Time `json:"viewedAt"`
}
