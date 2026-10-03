package repos

import (
	"gorm/backend/models"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestAggregateReactions(t *testing.T) {
	// filas ya ordenadas por (created_at, id), como las devuelve la consulta
	rows := []reactionRow{
		{MessageID: 1, UserID: 10, Emoji: "👍"},
		{MessageID: 1, UserID: 11, Emoji: "❤️"},
		{MessageID: 1, UserID: 12, Emoji: "❤️"},
		{MessageID: 2, UserID: 10, Emoji: "😂"},
		{MessageID: 1, UserID: 13, Emoji: "👍"},
		{MessageID: 1, UserID: 14, Emoji: "🙏"},
	}

	got := aggregateReactions(rows, 11)

	assert.Equal(t, []models.ReactionAggregate{
		// empate 2-2: 👍 apareció primero; luego 🙏 (1)
		{Emoji: "👍", Count: 2, Mine: false},
		{Emoji: "❤️", Count: 2, Mine: true},
		{Emoji: "🙏", Count: 1, Mine: false},
	}, got[1])
	assert.Equal(t, []models.ReactionAggregate{{Emoji: "😂", Count: 1, Mine: false}}, got[2])
	assert.NotContains(t, got, uint(3))
}

func TestAggregateReactions_Empty(t *testing.T) {
	assert.Empty(t, aggregateReactions(nil, 1))
}
