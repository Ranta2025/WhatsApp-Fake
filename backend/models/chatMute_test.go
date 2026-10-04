package models

import (
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm/schema"
)

// AutoMigrate es dueño del índice único (usuario, tipo de chat, destino): el
// upsert del repositorio usa ON CONFLICT sobre esas tres columnas.
func TestChatMuteUniqueIndex(t *testing.T) {
	s, err := schema.Parse(&ChatMute{}, &sync.Map{}, schema.NamingStrategy{})
	require.NoError(t, err)
	assert.Equal(t, "chat_mutes", s.Table)

	var unique, target *schema.Index
	for _, idx := range s.ParseIndexes() {
		switch idx.Name {
		case "idx_chat_mutes_user_chat":
			unique = idx
		case "idx_chat_mutes_target":
			target = idx
		}
	}
	require.NotNil(t, unique, "índice idx_chat_mutes_user_chat")
	assert.Equal(t, "UNIQUE", unique.Class)
	var cols []string
	for _, f := range unique.Fields {
		cols = append(cols, f.DBName)
	}
	assert.Equal(t, []string{"user_id", "chat_kind", "target_id"}, cols)

	// Índice secundario para el filtro del despacho de grupos (kind + grupo).
	require.NotNil(t, target, "índice idx_chat_mutes_target")
	var tcols []string
	for _, f := range target.Fields {
		tcols = append(tcols, f.DBName)
	}
	assert.Equal(t, []string{"chat_kind", "target_id"}, tcols)

	for _, col := range []string{"user_id", "chat_kind", "target_id"} {
		f := s.LookUpField(col)
		require.NotNil(t, f, col)
		assert.True(t, f.NotNull, "%s not null", col)
	}
	until := s.LookUpField("muted_until")
	require.NotNil(t, until)
	assert.False(t, until.NotNull, "muted_until NULL = para siempre")

	checks := s.ParseCheckConstraints()
	require.Contains(t, checks, "chk_chat_mutes_kind")
	assert.Contains(t, checks["chk_chat_mutes_kind"].Constraint, "chat_kind IN ('direct','group')")
}

func TestChatMuteActiveAt(t *testing.T) {
	now := time.Date(2026, 10, 4, 12, 0, 0, 0, time.UTC)
	past, future := now.Add(-time.Second), now.Add(time.Hour)
	assert.True(t, ChatMute{}.ActiveAt(now), "NULL = para siempre")
	assert.True(t, ChatMute{MutedUntil: &future}.ActiveAt(now))
	assert.False(t, ChatMute{MutedUntil: &past}.ActiveAt(now), "expirado")
	assert.False(t, ChatMute{MutedUntil: &now}.ActiveAt(now), "muted_until == now ya expiró")
}
