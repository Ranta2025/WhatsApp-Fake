package services

import (
	"encoding/json"
	"fmt"
	"strings"

	"gorm/backend/schemas"
)

// Contrato del payload Web Push (lo lee el service worker del frontend).
// Es JSON camelCase versionado con "v"; telephon solo existe en "direct" y
// groupID solo en "group".
const (
	pushPayloadVersion = 1
	PushKindDirect     = "direct"
	PushKindGroup      = "group"

	// pushGenericBody es el cuerpo cuando no se muestra el texto del mensaje
	// (preview apagado global o por usuario, o mensaje sin texto).
	pushGenericBody = "Nuevo mensaje"

	// maxPushBodyRunes y maxPushTitleRunes acotan el texto visible; con el
	// peor escapado JSON (\uXXXX = 6 bytes por carácter) el payload sigue
	// estando por debajo de 3 KB.
	maxPushBodyRunes  = 100
	maxPushTitleRunes = 60
)

// pushMediaLabels replica las etiquetas del frontend (utils/format.ts,
// MEDIA_LABELS) para que la notificación del sistema y el toast coincidan.
var pushMediaLabels = map[string]string{
	"image":    "📷 Foto",
	"audio":    "🎵 Audio",
	"video":    "🎥 Video",
	"document": "📄 Documento",
	"sticker":  "✨ Sticker",
}

// PushPayload es el JSON que se cifra y se envía a cada suscripción.
type PushPayload struct {
	V         int    `json:"v"`
	Kind      string `json:"kind"`
	Telephon  string `json:"telephon,omitempty"`
	GroupID   uint   `json:"groupID,omitempty"`
	MessageID uint   `json:"messageID"`
	Title     string `json:"title"`
	Body      string `json:"body"`
	Tag       string `json:"tag"`
}

// BuildDirectPushPayload arma el payload de un mensaje 1:1. El título es el
// username del remitente (o su teléfono si no se pudo resolver).
//
// Privacidad: con preview=false (PUSH_PREVIEW=off o el usuario lo desactivó)
// el título se conserva (nombre del remitente) y el cuerpo pasa a ser el
// genérico "Nuevo mensaje": nunca viaja el texto ni el tipo de media.
func BuildDirectPushPayload(msg schemas.Message, senderUsername string, preview bool) ([]byte, error) {
	title := senderUsername
	if strings.TrimSpace(title) == "" {
		title = msg.SenderTelephon
	}
	body := pushGenericBody
	if preview {
		body = pushMessageBody(msg.Message, msg.MediaType)
	}
	return json.Marshal(PushPayload{
		V:         pushPayloadVersion,
		Kind:      PushKindDirect,
		Telephon:  msg.SenderTelephon,
		MessageID: msg.MessageID,
		Title:     truncatePushText(title, maxPushTitleRunes),
		Body:      body,
		Tag:       msg.SenderTelephon,
	})
}

// BuildGroupPushPayload arma el payload de un mensaje de grupo: título = nombre
// del grupo y cuerpo "<remitente>: <texto>". Con preview=false el cuerpo es
// solo "Nuevo mensaje" (tampoco se revela quién escribió) y el título se
// conserva.
func BuildGroupPushPayload(msg schemas.GroupMessageResponse, groupName, senderUsername string, preview bool) ([]byte, error) {
	title := groupName
	if strings.TrimSpace(title) == "" {
		title = "Grupo"
	}
	body := pushGenericBody
	if preview {
		sender := senderUsername
		if strings.TrimSpace(sender) == "" {
			sender = msg.SenderTelephon
		}
		body = truncatePushText(sender, maxPushTitleRunes) + ": " + pushMessageBody(msg.Message, msg.MediaType)
	}
	return json.Marshal(PushPayload{
		V:         pushPayloadVersion,
		Kind:      PushKindGroup,
		GroupID:   msg.GroupID,
		MessageID: msg.MessageID,
		Title:     truncatePushText(title, maxPushTitleRunes),
		Body:      body,
		Tag:       fmt.Sprintf("group:%d", msg.GroupID),
	})
}

// pushMessageBody devuelve la etiqueta de media (tiene prioridad sobre el pie
// de foto, igual que el frontend) o el texto truncado.
func pushMessageBody(text, mediaType string) string {
	if label, ok := pushMediaLabels[mediaType]; ok {
		return label
	}
	text = strings.TrimSpace(text)
	if text == "" {
		return pushGenericBody
	}
	return truncatePushText(text, maxPushBodyRunes)
}

// truncatePushText corta a max caracteres (runas) y añade "…" si recortó.
func truncatePushText(s string, max int) string {
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	return string(r[:max]) + "…"
}
