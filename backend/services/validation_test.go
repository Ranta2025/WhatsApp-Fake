package services

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestValidateMessageContent(t *testing.T) {
	long := strings.Repeat("a", maxMessageLen+1)
	reply := strings.Repeat("ñ", maxMessageLen+10)

	assert.Error(t, validateMessageContent(&messageContent{}))
	assert.Error(t, validateMessageContent(&messageContent{Message: "   "}))
	assert.Error(t, validateMessageContent(&messageContent{Message: long}))
	assert.Error(t, validateMessageContent(&messageContent{Message: "hola", MediaType: "exe", MediaUrl: "/storage/a"}))
	assert.Error(t, validateMessageContent(&messageContent{MediaType: "document", MediaUrl: "javascript:alert(1)"}))
	assert.Error(t, validateMessageContent(&messageContent{Message: "x", MediaType: "image"}))
	// A builtin sticker path is only valid for the sticker media type; the same
	// path on an image must stay rejected.
	assert.Error(t, validateMessageContent(&messageContent{MediaType: "image", MediaUrl: "/stickers/basic/hola.webp"}))

	assert.NoError(t, validateMessageContent(&messageContent{Message: strings.Repeat("ñ", maxMessageLen)}))
	assert.NoError(t, validateMessageContent(&messageContent{MediaType: "image", MediaUrl: "/storage/media/images/a.jpg"}))
	assert.NoError(t, validateMessageContent(&messageContent{MediaType: "sticker", MediaUrl: "/stickers/basic/hola.webp"}))

	m := &messageContent{Message: "ok", ReplyToMessage: &reply}
	assert.NoError(t, validateMessageContent(m))
	assert.Equal(t, maxMessageLen, len([]rune(*m.ReplyToMessage)))
}
