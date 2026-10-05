package services

import (
	"errors"
	"gorm/backend/utils"
	"strings"
	"unicode/utf8"
)

const (
	// maxMessageLen es el tamaño de las columnas message / reply_to_message (size:400).
	maxMessageLen = 400
	// maxReplyTelephonLen es el tamaño de la columna reply_to_telephon (size:50).
	maxReplyTelephonLen = 50
)

// messageContent agrupa los campos de contenido comunes a mensajes 1:1 y de grupo.
type messageContent struct {
	Message         string
	MediaUrl        string
	MediaType       string
	ReplyToTelephon *string
	ReplyToMessage  *string
}

// ErrStickerNotEditable rejects editing a sticker message: a sticker renders
// from its image, never from editable text.
var ErrStickerNotEditable = errors.New("los stickers no se pueden editar")

// validateMessageContent valida (y normaliza) el contenido de un mensaje antes de
// persistirlo. Se aplica tanto al flujo HTTP como al WebSocket, de forma que los
// errores de datos se devuelven como errores de validación claros en vez de
// fallar en la BD (longitud de columnas, CHECK constraints) y se impide guardar
// URLs peligrosas que luego se renderizan en el cliente de otros usuarios.
func validateMessageContent(m *messageContent) error {
	if strings.TrimSpace(m.Message) == "" && m.MediaUrl == "" {
		return errors.New("el mensaje no puede estar vacío")
	}
	if utf8.RuneCountInString(m.Message) > maxMessageLen {
		return errors.New("el mensaje no puede superar los 400 caracteres")
	}
	if !utils.IsValidMediaType(m.MediaType) {
		return errors.New("tipo de archivo no válido")
	}
	if m.MediaType != "" && m.MediaUrl == "" {
		return errors.New("falta la URL del archivo adjunto")
	}
	if m.MediaUrl != "" {
		// A sticker may point at an app-provided path under /stickers/; every
		// other media type keeps the stricter IsSafeMediaURL allowlist.
		if m.MediaType == "sticker" {
			if !utils.IsBuiltinStickerURL(m.MediaUrl) && !utils.IsSafeMediaURL(m.MediaUrl) {
				return errors.New("URL del archivo adjunto no válida")
			}
		} else if !utils.IsSafeMediaURL(m.MediaUrl) {
			return errors.New("URL del archivo adjunto no válida")
		}
	}
	if m.ReplyToTelephon != nil && len(*m.ReplyToTelephon) > maxReplyTelephonLen {
		return errors.New("teléfono de respuesta no válido")
	}
	// La cita del mensaje original es solo una copia para mostrar: se recorta
	// en lugar de rechazar el mensaje.
	if m.ReplyToMessage != nil && utf8.RuneCountInString(*m.ReplyToMessage) > maxMessageLen {
		truncated := string([]rune(*m.ReplyToMessage)[:maxMessageLen])
		m.ReplyToMessage = &truncated
	}
	return nil
}

// validateEditedContent valida el nuevo contenido de un mensaje editado.
func validateEditedContent(content string) error {
	if strings.TrimSpace(content) == "" {
		return errors.New("el mensaje editado no puede estar vacío")
	}
	if utf8.RuneCountInString(content) > maxMessageLen {
		return errors.New("el mensaje no puede superar los 400 caracteres")
	}
	return nil
}
