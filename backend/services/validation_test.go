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

	// A sticker must be a builtin path, a relative storage URL or an absolute
	// URL pinned to the configured public base. Arbitrary external http(s) URLs,
	// even with a valid content hash, and generic storage images are rejected.
	sha := strings.Repeat("a", 64)
	t.Setenv("MEDIA_PUBLIC_BASE_URL", "https://pub-x.r2.dev")
	assert.Error(t, validateMessageContent(&messageContent{MediaType: "sticker", MediaUrl: "https://evil.com/cat.webp"}))
	assert.Error(t, validateMessageContent(&messageContent{MediaType: "sticker", MediaUrl: "/storage/media/images/a.jpg"}))
	assert.Error(t, validateMessageContent(&messageContent{MediaType: "sticker", MediaUrl: "https://evil.com/stickers/notahash.webp"}))
	assert.Error(t, validateMessageContent(&messageContent{MediaType: "sticker", MediaUrl: "https://evil-host/stickers/" + sha + ".webp"}))
	assert.Error(t, validateMessageContent(&messageContent{MediaType: "sticker", MediaUrl: "https://evil-host/stickers/" + sha + ".png"}))

	assert.NoError(t, validateMessageContent(&messageContent{Message: strings.Repeat("ñ", maxMessageLen)}))
	assert.NoError(t, validateMessageContent(&messageContent{MediaType: "image", MediaUrl: "/storage/media/images/a.jpg"}))
	assert.NoError(t, validateMessageContent(&messageContent{MediaType: "sticker", MediaUrl: "/stickers/basic/hola.webp"}))
	assert.NoError(t, validateMessageContent(&messageContent{MediaType: "sticker", MediaUrl: "/storage/media/stickers/" + sha + ".webp"}))
	assert.NoError(t, validateMessageContent(&messageContent{MediaType: "sticker", MediaUrl: "https://pub-x.r2.dev/stickers/" + sha + ".png"}))

	m := &messageContent{Message: "ok", ReplyToMessage: &reply}
	assert.NoError(t, validateMessageContent(m))
	assert.Equal(t, maxMessageLen, len([]rune(*m.ReplyToMessage)))
}

func TestValidateMessageContentStickerPublicBasePinning(t *testing.T) {
	sha := strings.Repeat("a", 64)
	pinned := "https://pub-x.r2.dev"
	url := pinned + "/stickers/" + sha + ".webp"

	t.Run("rejects public base when env unset", func(t *testing.T) {
		t.Setenv("MEDIA_PUBLIC_BASE_URL", "")
		assert.Error(t, validateMessageContent(&messageContent{MediaType: "sticker", MediaUrl: url}))
	})

	t.Run("accepts matching public base", func(t *testing.T) {
		t.Setenv("MEDIA_PUBLIC_BASE_URL", pinned)
		assert.NoError(t, validateMessageContent(&messageContent{MediaType: "sticker", MediaUrl: url}))
	})

	t.Run("accepts public base with trailing slash", func(t *testing.T) {
		t.Setenv("MEDIA_PUBLIC_BASE_URL", pinned+"/")
		assert.NoError(t, validateMessageContent(&messageContent{MediaType: "sticker", MediaUrl: url}))
	})

	t.Run("rejects other host with a valid hash", func(t *testing.T) {
		t.Setenv("MEDIA_PUBLIC_BASE_URL", pinned)
		assert.Error(t, validateMessageContent(&messageContent{MediaType: "sticker", MediaUrl: "https://evil-host/stickers/" + sha + ".webp"}))
	})
}
