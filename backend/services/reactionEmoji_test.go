package services

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestNormalizeReactionEmoji(t *testing.T) {
	valid := map[string]string{
		"thumbs up":           "👍",
		"red heart with FE0F": "❤️",
		"skin tone":           "👍🏽",
		"family ZWJ":          "👨‍👩‍👧",
		"flag":                "🇦🇷",
		"keycap":              "1️⃣",
		"keycap without FE0F": "1⃣",
		"face":                "😂",
	}
	for name, e := range valid {
		t.Run("valid "+name, func(t *testing.T) {
			got, err := NormalizeReactionEmoji(e)
			assert.NoError(t, err)
			assert.Equal(t, e, got)
		})
	}

	invalid := map[string]string{
		"empty":        "",
		"letter":       "a",
		"two emojis":   "👍👍",
		"word":         "ok",
		"space":        " ",
		"digit":        "1",
		"hash":         "#",
		"emoji+letter": "👍a",
		"letter+skin":  "a🏽",
		"single RI":    "🇦",
		"too long":     strings.Repeat("‍", 40),
		"newline":      "👍\n",
	}
	for name, e := range invalid {
		t.Run("invalid "+name, func(t *testing.T) {
			_, err := NormalizeReactionEmoji(e)
			assert.ErrorIs(t, err, ErrInvalidReactionEmoji)
		})
	}
}

func TestNormalizeReactionEmoji_MaxBytes(t *testing.T) {
	// ZWJ sequence larger than 32 bytes is one grapheme cluster but must be rejected.
	long := "👨‍👩‍👧‍👦‍👨‍👩‍👧‍👦" // 2 families joined => > 32 bytes
	assert.Greater(t, len(long), 32)
	_, err := NormalizeReactionEmoji(long)
	assert.ErrorIs(t, err, ErrInvalidReactionEmoji)
}
