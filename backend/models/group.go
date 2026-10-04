package models

import (
	"errors"
	"time"

	"gorm.io/gorm"
)

// Roles de miembro dentro de un grupo.
const (
	GroupRoleAdmin  = "admin"
	GroupRoleMember = "member"
)

// Kind de GroupMessage. "" es un mensaje normal del usuario; "system" es un
// evento de grupo persistido (persistido estructurado, no texto renderizado).
const GroupMessageKindSystem = "system"

// Eventos de sistema persistidos en el historial del grupo.
const (
	SystemEventMemberAdded     = "member_added"
	SystemEventMemberRemoved   = "member_removed"
	SystemEventMemberLeft      = "member_left"
	SystemEventAdminGranted    = "admin_granted"
	SystemEventAdminRevoked    = "admin_revoked"
	SystemEventSettingsChanged = "settings_changed"
	SystemEventInfoChanged     = "info_changed"
	// SystemEventDisappearingChanged también se usa en mensajes 1:1.
	SystemEventDisappearingChanged = "disappearing_changed"
)

// Group representa un grupo de chat.
// El creador es automáticamente el primer administrador.
type Group struct {
	gorm.Model
	Name        string `gorm:"size:100;not null"`
	Description string `gorm:"size:300"`
	AvatarUrl   string `gorm:"size:500"`
	CreatorID   uint   `gorm:"not null;index"`

	// Configuración de permisos del grupo. Todas parten en false (el
	// comportamiento abierto de siempre): un admin las activa para restringir
	// la acción a admins. Los grupos existentes quedan igual al migrar.
	OnlyAdminsCanSend       bool `gorm:"not null;default:false"`
	OnlyAdminsCanEditInfo   bool `gorm:"not null;default:false"`
	OnlyAdminsCanAddMembers bool `gorm:"not null;default:false"`

	// Temporizador de mensajes temporales en segundos (0 = desactivado).
	DisappearSeconds int `gorm:"not null;default:0"`

	Creator UserDataBase  `gorm:"foreignKey:CreatorID;references:ID"`
	Members []GroupMember `gorm:"foreignKey:GroupID"`
}

// GroupMember registra la membresía de un usuario en un grupo.
// El índice único parcial (group_id, user_id) se aplica en postgres.go
// para permitir soft-delete y re-unirse al grupo.
type GroupMember struct {
	gorm.Model
	GroupID   uint   `gorm:"not null;index"`
	UserID    uint   `gorm:"not null;index"`
	Role      string `gorm:"size:20;not null;default:'member'"` // "admin" | "member"
	AddedByID uint   `gorm:"not null"`

	// Acuses de recibo por miembro (marcas de agua). Los ids de mensaje son
	// seriales globales: solo son comparables dentro de un mismo grupo.
	// Solo avanzan (nunca retroceden) y quedan acotados al máximo id del grupo.
	JoinedMessageID        uint `gorm:"not null;default:0"` // max id de mensaje del grupo al unirse (0 = miembros previos)
	LastDeliveredMessageID uint `gorm:"not null;default:0"`
	LastReadMessageID      uint `gorm:"not null;default:0"`
	LastDeliveredAt        *time.Time
	LastReadAt             *time.Time

	Group   Group        `gorm:"foreignKey:GroupID;references:ID"`
	User    UserDataBase `gorm:"foreignKey:UserID;references:ID"`
	AddedBy UserDataBase `gorm:"foreignKey:AddedByID;references:ID"`
}

// GroupMessage es un mensaje enviado dentro de un grupo.
// Tabla separada de `messages` para independencia total entre chats 1:1 y grupales.
type GroupMessage struct {
	gorm.Model
	GroupID  uint      `gorm:"not null;index"`
	SenderID uint      `gorm:"not null;index"`
	Message  string    `gorm:"size:400"`
	Time     time.Time `gorm:"not null"`
	Edited   bool      `gorm:"default:false"`

	// Campos de media (mismos tipos que Message)
	MediaUrl  string `gorm:"size:500"`
	MediaType string `gorm:"size:20"`

	// Campos para responder mensajes
	ReplyToMessageID *uint   `gorm:"index"`
	ReplyToTelephon  *string `gorm:"column:reply_to_telephon;size:50"`
	ReplyToMessage   *string `gorm:"size:400"`

	// Mensajes de sistema: eventos de grupo persistidos y renderizados por el
	// cliente desde datos estructurados (no guardan texto por espectador).
	// Kind "" = mensaje normal; "system" = evento. SystemTargets son los
	// teléfonos afectados (p. ej. los añadidos en un member_added).
	Kind        string `gorm:"size:20;not null;default:''"`
	SystemEvent string `gorm:"size:30;not null;default:''"`
	// ExpiresAt es el instante de expiración (nil = no expira).
	ExpiresAt     *time.Time
	SystemTargets []string `gorm:"type:jsonb;serializer:json"`

	// ClientID is the sender-generated idempotency key (lowercase UUID, nil when
	// absent). Unique per sender through a partial index (see database/postgres.go).
	ClientID *string `gorm:"size:36"`

	Group  Group        `gorm:"foreignKey:GroupID;references:ID"`
	Sender UserDataBase `gorm:"foreignKey:SenderID;references:ID"`
}

// NewSystemMessage construye un mensaje de sistema listo para insertar en la
// transacción del caller. SenderID es el actor del evento; targets son los
// teléfonos afectados (puede ser nil si el repo los completa).
func NewSystemMessage(groupID, senderID uint, event string, targets []string) *GroupMessage {
	return &GroupMessage{
		GroupID:       groupID,
		SenderID:      senderID,
		Kind:          GroupMessageKindSystem,
		SystemEvent:   event,
		SystemTargets: targets,
		Time:          time.Now(),
	}
}

// UserGroupRow es un grupo del usuario con los datos agregados para el listado
// (rol del usuario, número de miembros y teléfono del creador).
type UserGroupRow struct {
	Group
	UserRole        string
	MemberCount     int
	CreatorTelephon string
}

// GroupReceiptState son las marcas de agua de acuse de un miembro en un grupo:
// hasta qué id de mensaje ha recibido y hasta cuál ha leído.
type GroupReceiptState struct {
	DeliveredUpTo uint
	ReadUpTo      uint
}

// ErrGroupMessageNotFound lo devuelve el repositorio cuando el mensaje de grupo no existe.
var ErrGroupMessageNotFound = errors.New("mensaje no encontrado")
