package schemas

import "time"

// CallLogResponse es lo que el frontend recibe para cada registro de llamada
type CallLogResponse struct {
	ID               uint       `json:"id"`
	CallerTelephon   string     `json:"callerTelephon"`
	CallerUsername   string     `json:"callerUsername"`
	ReceiverTelephon string     `json:"receiverTelephon"`
	ReceiverUsername string     `json:"receiverUsername"`
	CallType         string     `json:"callType"` // "video" o "audio"
	Status           string     `json:"status"`   // "answered", "missed", "rejected", "unavailable"
	StartedAt        time.Time  `json:"startedAt"`
	AnsweredAt       *time.Time `json:"answeredAt,omitempty"`
	EndedAt          *time.Time `json:"endedAt,omitempty"`
	Duration         int        `json:"duration"`   // Segundos
	IsOutgoing       bool       `json:"isOutgoing"` // true si el usuario actual fue quien llamó
	IsGroupCall      bool       `json:"isGroupCall"` // true si es llamada grupal
	GroupID          *uint      `json:"groupID,omitempty"`
	GroupName        string     `json:"groupName,omitempty"`
}
