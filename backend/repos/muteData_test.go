package repos

import (
	"context"
	"testing"
	"time"

	"gorm/backend/models"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var muteNow = time.Date(2026, 10, 4, 12, 0, 0, 0, time.UTC)

// activeMuteFilter es el predicado de vigencia que deben llevar todas las
// lecturas: NULL = para siempre, y estrictamente posterior a now.
const activeMuteFilter = "(m.muted_until IS NULL OR m.muted_until > '2026-10-04 12:00:00')"

func TestMuteRepoGetIdDelegates(t *testing.T) {
	db, _ := dryRunDB(t)
	r := InitRepoMute(db, stubIDResolver{id: 9})
	id, err := r.GetIdByTelephon("+51999", context.Background())
	require.NoError(t, err)
	assert.Equal(t, 9, id)
}

func TestMuteRepoUpsertOnUserChatConflict(t *testing.T) {
	db, rec := dryRunDB(t)
	r := InitRepoMute(db, nil)
	until := muteNow.Add(8 * time.Hour)
	require.NoError(t, r.UpsertMute(&models.ChatMute{UserID: 3, ChatKind: models.ChatKindDirect, TargetID: 4, MutedUntil: &until}, context.Background()))

	s := pushStmt(t, rec)
	assert.Contains(t, s, `INSERT INTO "chat_mutes"`)
	assert.Contains(t, s, `ON CONFLICT ("user_id","chat_kind","target_id") DO UPDATE SET`)
	assert.Contains(t, s, `"muted_until"="excluded"."muted_until"`)
	assert.Contains(t, s, `"updated_at"="excluded"."updated_at"`)
	assert.NotContains(t, s, `"created_at"="excluded"`, "created_at se conserva")
}

func TestMuteRepoDeleteIsScopedToUserAndChat(t *testing.T) {
	db, rec := dryRunDB(t)
	r := InitRepoMute(db, nil)
	require.NoError(t, r.DeleteMute(3, models.ChatKindGroup, 7, context.Background()))

	s := pushStmt(t, rec)
	assert.Contains(t, s, `DELETE FROM "chat_mutes"`)
	assert.Contains(t, s, `user_id = 3 AND chat_kind = 'group' AND target_id = 7`)
}

func TestMuteRepoListActiveMutesFiltersExpiredAndJoinsPeer(t *testing.T) {
	db, rec := dryRunDB(t)
	r := InitRepoMute(db, nil)
	_, err := r.ListActiveMutes(3, muteNow, context.Background())
	require.NoError(t, err)

	s := pushStmt(t, rec)
	assert.Contains(t, s, `FROM chat_mutes m`)
	assert.Contains(t, s, `LEFT JOIN user_data_bases u ON m.chat_kind = 'direct' AND u.id = m.target_id`)
	assert.Contains(t, s, `m.user_id = 3`)
	assert.Contains(t, s, activeMuteFilter)
	assert.Contains(t, s, `u.telephon AS peer_telephon`)
}

// Directo: una sola consulta resuelve silencio y estado de contacto del
// receptor hacia el remitente.
func TestMuteRepoDirectPushStateSingleQuery(t *testing.T) {
	db, rec := dryRunDB(t)
	r := InitRepoMute(db, nil)
	_, err := r.DirectPushState("+2", "+1", muteNow, context.Background())
	require.NoError(t, err)

	s := pushStmt(t, rec)
	assert.Contains(t, s, `FROM chat_mutes m WHERE m.user_id = r.id AND m.chat_kind = 'direct' AND m.target_id = s.id`)
	assert.Contains(t, s, activeMuteFilter)
	assert.Contains(t, s, `FROM contact_data_bases c WHERE c.id_user = r.id AND c.id_contact = s.id AND c.deleted_at IS NULL`)
	assert.Contains(t, s, `r.telephon = '+2' AND s.telephon = '+1'`)
}

// Grupo: una sola consulta para todos los destinatarios (no una por miembro).
func TestMuteRepoMutedTelephonsInGroupSingleQuery(t *testing.T) {
	db, rec := dryRunDB(t)
	r := InitRepoMute(db, nil)
	_, err := r.MutedTelephonsInGroup(7, []string{"+2", "+3", "+4"}, muteNow, context.Background())
	require.NoError(t, err)

	s := pushStmt(t, rec)
	assert.Contains(t, s, `FROM chat_mutes m JOIN user_data_bases u ON u.id = m.user_id`)
	assert.Contains(t, s, `m.chat_kind = 'group' AND m.target_id = 7`)
	assert.Contains(t, s, `u.telephon IN ('+2','+3','+4')`)
	assert.Contains(t, s, activeMuteFilter)
}

func TestMuteRepoMutedTelephonsInGroupNoRecipientsNoQuery(t *testing.T) {
	db, rec := dryRunDB(t)
	r := InitRepoMute(db, nil)
	got, err := r.MutedTelephonsInGroup(7, nil, muteNow, context.Background())
	require.NoError(t, err)
	assert.Empty(t, got)
	assert.Empty(t, rec.all())
}
