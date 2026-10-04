//go:build e2e

// Ventanas around/after del historial (repos + HTTP contra Postgres real).
package integration

import (
	"context"
	"fmt"
	"gorm/backend/database"
	"gorm/backend/models"
	"gorm/backend/repos"
	"gorm/backend/utils"
	"os"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func messageIDs(msgs []models.Message) []uint {
	out := make([]uint, 0, len(msgs))
	for _, m := range msgs {
		out = append(out, m.ID)
	}
	return out
}

func groupMessageIDs(msgs []models.GroupMessage) []uint {
	out := make([]uint, 0, len(msgs))
	for _, m := range msgs {
		out = append(out, m.ID)
	}
	return out
}

func TestE2EHistoryWindows(t *testing.T) {
	base := os.Getenv("E2E_BASE_URL")
	require.NotEmpty(t, base, "E2E_BASE_URL requerido")
	db, err := database.Conection()
	require.NoError(t, err)
	ctx := context.Background()
	contactRepo := repos.InitRepoContact(db, nil)
	groupRepo := repos.InitRepoGroup(db, nil)

	suffix := time.Now().UnixNano() % 1000000
	hash, err := utils.Hash("Passw0rd!")
	require.NoError(t, err)
	mk := func(name string, n int) models.UserDataBase {
		u := models.UserDataBase{User: models.User{
			Username: fmt.Sprintf("wn%s%d", name, suffix),
			Gmail:    fmt.Sprintf("wn%s%d@gmail.com", name, suffix),
			Telephon: fmt.Sprintf("+55%d%07d", n, suffix),
		}, Password: hash, Activo: true}
		require.NoError(t, db.Create(&u).Error)
		return u
	}
	alice, bob, carol := mk("alice", 1), mk("bob", 2), mk("carol", 3)
	now := time.Now()

	// 30 mensajes alice<->bob (alternando emisor), más uno de bob<->carol
	var ids []uint
	for i := 0; i < 30; i++ {
		from, to := alice, bob
		if i%2 == 1 {
			from, to = bob, alice
		}
		m := models.Message{IdUser: from.ID, IdReceptor: to.ID, Message: fmt.Sprintf("w%02d", i), Status: "enviado", Time: now}
		require.NoError(t, db.Create(&m).Error)
		ids = append(ids, m.ID)
	}
	other := models.Message{IdUser: bob.ID, IdReceptor: carol.ID, Message: "privado", Status: "enviado", Time: now}
	require.NoError(t, db.Create(&other).Error)

	t.Run("around: window centered on target with both flags", func(t *testing.T) {
		msgs, older, newer, err := contactRepo.GetMessagesAround(alice.ID, bob.ID, ids[15], 10, ctx)
		require.NoError(t, err)
		assert.Equal(t, ids[10:21], messageIDs(msgs), "5 antes + objetivo + 5 después, cronológico")
		assert.True(t, older)
		assert.True(t, newer)
	})

	t.Run("around: edges report no more on that side", func(t *testing.T) {
		msgs, older, newer, err := contactRepo.GetMessagesAround(alice.ID, bob.ID, ids[1], 10, ctx)
		require.NoError(t, err)
		assert.Equal(t, ids[0:7], messageIDs(msgs))
		assert.False(t, older)
		assert.True(t, newer)

		msgs, older, newer, err = contactRepo.GetMessagesAround(bob.ID, alice.ID, ids[29], 10, ctx)
		require.NoError(t, err)
		assert.Equal(t, ids[24:30], messageIDs(msgs))
		assert.True(t, older)
		assert.False(t, newer)

		msgs, older, newer, err = contactRepo.GetMessagesAround(alice.ID, bob.ID, ids[15], 100, ctx)
		require.NoError(t, err)
		assert.Equal(t, ids, messageIDs(msgs))
		assert.False(t, older)
		assert.False(t, newer)
	})

	t.Run("around: target must be visible to the user", func(t *testing.T) {
		// mensaje de otra conversación
		_, _, _, err := contactRepo.GetMessagesAround(alice.ID, bob.ID, other.ID, 10, ctx)
		assert.ErrorIs(t, err, models.ErrMessageNotFound)
		// un tercero no puede anclarse en la conversación alice-bob
		_, _, _, err = contactRepo.GetMessagesAround(carol.ID, bob.ID, ids[3], 10, ctx)
		assert.ErrorIs(t, err, models.ErrMessageNotFound)
		// inexistente
		_, _, _, err = contactRepo.GetMessagesAround(alice.ID, bob.ID, 999999999, 10, ctx)
		assert.ErrorIs(t, err, models.ErrMessageNotFound)
	})

	t.Run("around/after skip messages hidden for me and soft deleted", func(t *testing.T) {
		require.NoError(t, db.Model(&models.Message{}).Where("id = ?", ids[16]).Update("deleted_by_sender", true).Error) // ids[16]: alice emisora
		require.NoError(t, db.Delete(&models.Message{}, ids[17]).Error)
		msgs, _, _, err := contactRepo.GetMessagesAround(alice.ID, bob.ID, ids[15], 10, ctx)
		require.NoError(t, err)
		assert.NotContains(t, messageIDs(msgs), ids[16])
		assert.NotContains(t, messageIDs(msgs), ids[17])
		// bob sí ve ids[16] (solo lo ocultó alice)
		msgs, _, _, err = contactRepo.GetMessagesAround(bob.ID, alice.ID, ids[15], 10, ctx)
		require.NoError(t, err)
		assert.Contains(t, messageIDs(msgs), ids[16])
		// un objetivo oculto para mí es 404
		_, _, _, err = contactRepo.GetMessagesAround(alice.ID, bob.ID, ids[16], 10, ctx)
		assert.ErrorIs(t, err, models.ErrMessageNotFound)
	})

	t.Run("after: ascending, limit and hasNewer", func(t *testing.T) {
		msgs, newer, err := contactRepo.GetMessagesAfter(bob.ID, alice.ID, ids[20], 5, ctx)
		require.NoError(t, err)
		assert.Equal(t, ids[21:26], messageIDs(msgs))
		assert.True(t, newer)

		msgs, newer, err = contactRepo.GetMessagesAfter(bob.ID, alice.ID, ids[26], 5, ctx)
		require.NoError(t, err)
		assert.Equal(t, ids[27:30], messageIDs(msgs))
		assert.False(t, newer)

		msgs, newer, err = contactRepo.GetMessagesAfter(bob.ID, alice.ID, ids[29], 5, ctx)
		require.NoError(t, err)
		assert.Empty(t, msgs)
		assert.False(t, newer)
	})

	// ── Grupos ────────────────────────────────────────────────────────────────
	group := models.Group{Name: fmt.Sprintf("win%d", suffix), CreatorID: alice.ID}
	require.NoError(t, groupRepo.CreateGroupWithMembers(&group, alice.ID, []uint{bob.ID}, ctx))
	otherGroup := models.Group{Name: fmt.Sprintf("winb%d", suffix), CreatorID: alice.ID}
	require.NoError(t, groupRepo.CreateGroupWithMembers(&otherGroup, alice.ID, nil, ctx))
	var gids []uint
	for i := 0; i < 20; i++ {
		m := models.GroupMessage{GroupID: group.ID, SenderID: alice.ID, Message: fmt.Sprintf("g%02d", i), Time: now}
		require.NoError(t, db.Create(&m).Error)
		gids = append(gids, m.ID)
	}
	foreign := models.GroupMessage{GroupID: otherGroup.ID, SenderID: alice.ID, Message: "otro grupo", Time: now}
	require.NoError(t, db.Create(&foreign).Error)

	t.Run("group around/after", func(t *testing.T) {
		msgs, older, newer, err := groupRepo.GetGroupMessagesAround(group.ID, gids[10], 6, ctx)
		require.NoError(t, err)
		assert.Equal(t, gids[7:14], groupMessageIDs(msgs), "cronológico, 3 + objetivo + 3")
		assert.True(t, older)
		assert.True(t, newer)
		assert.NotEmpty(t, msgs[0].Sender.Username, "precarga el remitente")

		msgs, older, newer, err = groupRepo.GetGroupMessagesAround(group.ID, gids[0], 6, ctx)
		require.NoError(t, err)
		assert.Equal(t, gids[0:4], groupMessageIDs(msgs))
		assert.False(t, older)
		assert.True(t, newer)

		_, _, _, err = groupRepo.GetGroupMessagesAround(group.ID, foreign.ID, 6, ctx)
		assert.ErrorIs(t, err, models.ErrGroupMessageNotFound, "mensaje de otro grupo")
		require.NoError(t, db.Delete(&models.GroupMessage{}, gids[5]).Error)
		_, _, _, err = groupRepo.GetGroupMessagesAround(group.ID, gids[5], 6, ctx)
		assert.ErrorIs(t, err, models.ErrGroupMessageNotFound, "mensaje borrado")

		after, newer, err := groupRepo.GetGroupMessagesAfter(group.ID, gids[15], 3, ctx)
		require.NoError(t, err)
		assert.Equal(t, gids[16:19], groupMessageIDs(after))
		assert.True(t, newer)
		after, newer, err = groupRepo.GetGroupMessagesAfter(group.ID, gids[17], 5, ctx)
		require.NoError(t, err)
		assert.Equal(t, gids[18:20], groupMessageIDs(after))
		assert.False(t, newer)
	})

	// ── HTTP ──────────────────────────────────────────────────────────────────
	login := func(u models.UserDataBase) *e2eClient {
		c := newClient(t, base)
		code, _ := c.do("POST", "/api/v1/auth/login", map[string]string{"username": u.Username, "password": "Passw0rd!"})
		require.Equal(t, 200, code)
		return c
	}
	ca, cc := login(alice), login(carol)

	t.Run("http chat around: array + headers, 404 when not visible, legacy untouched", func(t *testing.T) {
		resp := ca.raw("GET", fmt.Sprintf("/api/v1/chat/%s?around=%d&limit=10", bob.Telephon, ids[15]))
		assert.Equal(t, 200, resp.status)
		assert.Equal(t, "true", resp.header.Get("X-Has-More-Older"))
		assert.Equal(t, "true", resp.header.Get("X-Has-More-Newer"))
		assert.Equal(t, byte('['), resp.body[0])

		resp = ca.raw("GET", fmt.Sprintf("/api/v1/chat/%s?around=%d", bob.Telephon, other.ID))
		assert.Equal(t, 404, resp.status)

		resp = ca.raw("GET", fmt.Sprintf("/api/v1/chat/%s?after=%d&limit=3", bob.Telephon, ids[26]))
		assert.Equal(t, 200, resp.status)
		assert.Equal(t, "false", resp.header.Get("X-Has-More-Newer"))

		resp = ca.raw("GET", "/api/v1/chat/"+bob.Telephon+"?limit=5")
		assert.Equal(t, 200, resp.status)
		assert.Equal(t, "", resp.header.Get("X-Has-More-Older"))
	})

	t.Run("http group around: flags in JSON, outsider 403, foreign message 404", func(t *testing.T) {
		code, out := ca.do("GET", fmt.Sprintf("/api/v1/group/%d/message?around=%d&limit=6", group.ID, gids[10]), nil)
		require.Equal(t, 200, code, out)
		assert.Equal(t, true, out["hasMoreOlder"])
		assert.Equal(t, true, out["hasMoreNewer"])
		assert.Len(t, out["messages"], 7)

		code, _ = cc.do("GET", fmt.Sprintf("/api/v1/group/%d/message?around=%d", group.ID, gids[10]), nil)
		assert.Equal(t, 403, code)
		code, _ = ca.do("GET", fmt.Sprintf("/api/v1/group/%d/message?around=%d", group.ID, foreign.ID), nil)
		assert.Equal(t, 404, code)
	})
}
