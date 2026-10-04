package schemas

import "time"

// MuteResponse es la respuesta de PUT chat/:contact/mute y
// PUT group/:groupID/mute (camelCase, endpoint nuevo). mutedUntil es null
// cuando el silencio es "para siempre".
type MuteResponse struct {
	Muted      bool       `json:"muted"`
	MutedUntil *time.Time `json:"mutedUntil"`
}
