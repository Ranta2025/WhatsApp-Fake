package models

import "time"

// PushSubscription es una suscripción Web Push de un navegador/dispositivo de
// un usuario. El endpoint es único en toda la tabla (índice
// idx_push_subscriptions_endpoint): si otro usuario inicia sesión en el mismo
// navegador, la fila se reasigna a él. No usa soft delete: una suscripción
// dada de baja o expirada (404/410 del servicio de push) se borra de verdad.
type PushSubscription struct {
	ID            uint       `gorm:"primaryKey" json:"id"`
	UserID        uint       `gorm:"index;not null" json:"userId"`
	Endpoint      string     `gorm:"type:text;not null" json:"endpoint"`
	P256dh        string     `gorm:"column:p256dh" json:"-"`
	Auth          string     `gorm:"column:auth" json:"-"`
	UserAgent     string     `gorm:"size:300" json:"userAgent"`
	CreatedAt     time.Time  `json:"createdAt"`
	LastSuccessAt *time.Time `json:"lastSuccessAt"`
}

// PushSubscriptionKeys son las claves de cifrado de la suscripción (RFC 8291).
type PushSubscriptionKeys struct {
	P256dh string `json:"p256dh"`
	Auth   string `json:"auth"`
}

// PushSubscriptionInput es exactamente el JSON de PushSubscription.toJSON()
// del navegador. expirationTime se acepta y se ignora (no se declara: el
// binding descarta los campos desconocidos).
type PushSubscriptionInput struct {
	Endpoint string               `json:"endpoint"`
	Keys     PushSubscriptionKeys `json:"keys"`
}

// PushUnsubscribeInput es el cuerpo de DELETE push/subscribe.
type PushUnsubscribeInput struct {
	Endpoint string `json:"endpoint"`
}

// PushPreviewInput es el cuerpo de PUT push/preview. Es puntero para poder
// rechazar el campo ausente (false explícito es un valor válido).
type PushPreviewInput struct {
	Preview *bool `json:"preview"`
}
