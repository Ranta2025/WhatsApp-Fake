//go:build integration

// Tests de integración contra PostgreSQL y Redis reales.
// Ejecutar con:  go test -tags integration ./backend/integration/
// usando las variables POSTGRES_* y REDIS_* del entorno (¡usa una BD de pruebas!).
package integration

import (
	"context"
	"fmt"
	"gorm/backend/cache"
	"gorm/backend/database"
	"gorm/backend/models"
	"gorm/backend/repos"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setup(t *testing.T) (*gorm.DB, *repos.ApiContact, *repos.RepoGroup, *repos.RepositoriesUser, *cache.CacheUser) {
	db, err := database.Conection()
	require.NoError(t, err)
	rd, err := database.GetRedis()
	require.NoError(t, err)
	for _, table := range []string{"group_messages", "group_members", "groups", "call_logs", "messages", "contact_data_bases", "user_data_bases"} {
		require.NoError(t, db.Exec("TRUNCATE TABLE "+table+" RESTART IDENTITY CASCADE").Error)
	}
	require.NoError(t, rd.FlushDB(context.Background()).Err())
	return db, repos.InitRepoContact(db, rd), repos.InitRepoGroup(db, rd), repos.GetRespositorieUser(db), cache.InitChacheUser(rd)
}

func createUser(t *testing.T, db *gorm.DB, n int) models.UserDataBase {
	u := models.UserDataBase{
		User:     models.User{Username: fmt.Sprintf("user%d", n), Gmail: fmt.Sprintf("u%d@gmail.com", n), Telephon: fmt.Sprintf("+5020000000%d", n)},
		Password: "hash", Activo: true,
	}
	require.NoError(t, db.Create(&u).Error)
	return u
}

func TestIntegration(t *testing.T) {
	db, contactRepo, groupRepo, userRepo, userCache := setup(t)
	ctx := context.Background()
	a, b, c := createUser(t, db, 1), createUser(t, db, 2), createUser(t, db, 3)

	t.Run("auth lookup", func(t *testing.T) {
		auth, err := userRepo.GetAuthByUsername("user1", ctx)
		require.NoError(t, err)
		assert.Equal(t, a.Telephon, auth.Telephon)
		assert.True(t, auth.Activo)
		_, err = userRepo.GetAuthByUsername("nadie", ctx)
		assert.Error(t, err)
		assert.True(t, userRepo.UsernameExist("user2", ctx))
		assert.False(t, userRepo.TelephonExist("+999", ctx))
	})

	t.Run("recent messages per chat", func(t *testing.T) {
		base := time.Now().Add(-time.Hour)
		for i := 0; i < 5; i++ {
			require.NoError(t, contactRepo.CreateMessage(&models.Message{IdUser: a.ID, IdReceptor: b.ID, Message: fmt.Sprintf("ab%d", i), Status: "enviado", Time: base.Add(time.Duration(i) * time.Minute)}, ctx))
		}
		require.NoError(t, contactRepo.CreateMessage(&models.Message{IdUser: c.ID, IdReceptor: a.ID, Message: "ca", Status: "enviado", Time: base}, ctx))

		msgs, err := contactRepo.GetRecentMessagesForUser(a.ID, 3, ctx)
		require.NoError(t, err)
		assert.Len(t, msgs, 4) // 3 del chat con b + 1 del chat con c
		var withB []string
		for _, m := range msgs {
			if m.IdReceptor == b.ID {
				withB = append(withB, m.Message)
			}
		}
		assert.Equal(t, []string{"ab2", "ab3", "ab4"}, withB)

		users, err := contactRepo.GetUsersBasicByIDs([]uint{b.ID, c.ID}, ctx)
		require.NoError(t, err)
		assert.Equal(t, b.Telephon, users[b.ID].Telephon)
		assert.Equal(t, "user3", users[c.ID].Username)

		require.NoError(t, contactRepo.ClearChatForUser(a.ID, b.ID, ctx))
		msgs, err = contactRepo.GetRecentMessagesForUser(a.ID, 3, ctx)
		require.NoError(t, err)
		assert.Len(t, msgs, 1)
	})

	t.Run("chat messages cursor pagination", func(t *testing.T) {
		// Conversación b<->c (independiente del resto de subtests). Todos los
		// mensajes comparten timestamp para forzar el desempate por id.
		same := time.Now()
		var ids []uint
		for i := 0; i < 7; i++ {
			from, to := b.ID, c.ID
			if i%2 == 1 {
				from, to = c.ID, b.ID
			}
			m := &models.Message{IdUser: from, IdReceptor: to, Message: fmt.Sprintf("p%d", i), Status: "enviado", Time: same}
			require.NoError(t, contactRepo.CreateMessage(m, ctx))
			ids = append(ids, m.ID)
		}
		// El mensaje 3 lo borra solo b (per-user delete flag): b no debe verlo, c sí.
		_, err := contactRepo.DeleteMessageForMe(ids[3], b.ID, ctx)
		require.NoError(t, err)

		seen := map[uint]bool{}
		var before uint
		pages := 0
		for {
			page, hasMore, err := contactRepo.GetMessagesPage(b.ID, c.ID, before, 3, ctx)
			require.NoError(t, err)
			pages++
			for i, m := range page {
				assert.False(t, seen[m.ID], "mensaje duplicado %d", m.ID)
				seen[m.ID] = true
				if i > 0 {
					assert.Less(t, page[i-1].ID, m.ID, "orden cronológico dentro de la página")
				}
			}
			if !hasMore {
				break
			}
			require.Len(t, page, 3)
			before = page[0].ID // el más antiguo de la página
			require.Less(t, pages, 10, "no debe ciclar")
		}
		assert.Len(t, seen, 6, "7 mensajes menos el borrado para b")
		assert.False(t, seen[ids[3]])

		// Frontera exacta y visibilidad del otro lado.
		page, hasMore, err := contactRepo.GetMessagesPage(b.ID, c.ID, 0, 6, ctx)
		require.NoError(t, err)
		assert.Len(t, page, 6)
		assert.False(t, hasMore)
		_, hasMore, err = contactRepo.GetMessagesPage(b.ID, c.ID, 0, 5, ctx)
		require.NoError(t, err)
		assert.True(t, hasMore)
		page, _, err = contactRepo.GetMessagesPage(c.ID, b.ID, 0, 10, ctx)
		require.NoError(t, err)
		assert.Len(t, page, 7, "el otro participante aún ve el mensaje")
	})

	t.Run("groups", func(t *testing.T) {
		g := &models.Group{Name: "grupo", CreatorID: a.ID}
		require.NoError(t, groupRepo.CreateGroupWithMembers(g, a.ID, []uint{b.ID}, ctx))

		// Añadir un miembro ya existente no debe fallar (ON CONFLICT DO NOTHING)
		require.NoError(t, groupRepo.AddMembers(g.ID, []models.GroupMember{{UserID: b.ID, Role: "member", AddedByID: a.ID}, {UserID: c.ID, Role: "member", AddedByID: a.ID}}, ctx))

		rows, err := groupRepo.GetUserGroups(b.ID, ctx)
		require.NoError(t, err)
		require.Len(t, rows, 1)
		assert.Equal(t, 3, rows[0].MemberCount)
		assert.Equal(t, "member", rows[0].UserRole)
		assert.Equal(t, a.Telephon, rows[0].CreatorTelephon)
		assert.Equal(t, "grupo", rows[0].Name)

		// El admin sale: el miembro más antiguo pasa a ser admin
		require.NoError(t, groupRepo.LeaveGroup(g.ID, a.ID, ctx))
		rows, err = groupRepo.GetUserGroups(b.ID, ctx)
		require.NoError(t, err)
		assert.Equal(t, "admin", rows[0].UserRole)
		assert.Equal(t, 2, rows[0].MemberCount)

		msg := &models.GroupMessage{GroupID: g.ID, SenderID: b.ID, Message: "hola", Time: time.Now()}
		require.NoError(t, groupRepo.CreateGroupMessage(msg, ctx))
		assert.Error(t, groupRepo.EditGroupMessage(g.ID+1, msg.ID, b.ID, "x", ctx), "no debe editar en otro grupo")
		assert.Error(t, groupRepo.EditGroupMessage(g.ID, msg.ID, c.ID, "x", ctx), "solo el autor edita")
		assert.NoError(t, groupRepo.EditGroupMessage(g.ID, msg.ID, b.ID, "editado", ctx))
		msgs, err := groupRepo.GetGroupMessages(g.ID, 10, 0, ctx)
		require.NoError(t, err)
		assert.Equal(t, b.Telephon, msgs[0].Sender.Telephon)
		assert.Empty(t, msgs[0].Sender.Password, "no se deben cargar datos sensibles")
	})

	t.Run("group messages cursor pagination", func(t *testing.T) {
		g := &models.Group{Name: "paginado", CreatorID: a.ID}
		require.NoError(t, groupRepo.CreateGroupWithMembers(g, a.ID, []uint{b.ID}, ctx))
		// 7 mensajes; los 4 últimos comparten exactamente el mismo timestamp.
		same := time.Now()
		var ids []uint
		for i := 0; i < 7; i++ {
			ts := same
			if i < 3 {
				ts = same.Add(-time.Hour + time.Duration(i)*time.Second)
			}
			m := &models.GroupMessage{GroupID: g.ID, SenderID: b.ID, Message: fmt.Sprintf("m%d", i), Time: ts}
			require.NoError(t, groupRepo.CreateGroupMessage(m, ctx))
			ids = append(ids, m.ID)
		}

		seen := map[uint]bool{}
		var before uint
		pages := 0
		for {
			page, hasMore, err := groupRepo.GetGroupMessagesPage(g.ID, before, 3, 0, ctx)
			require.NoError(t, err)
			pages++
			for _, m := range page {
				assert.False(t, seen[m.ID], "mensaje duplicado %d", m.ID)
				seen[m.ID] = true
			}
			if !hasMore {
				break
			}
			require.Len(t, page, 3)
			before = page[len(page)-1].ID
			require.Less(t, pages, 10, "no debe ciclar")
		}
		assert.Equal(t, 3, pages)
		assert.Len(t, seen, 7, "sin huecos ni duplicados con timestamps iguales")
		for _, id := range ids {
			assert.True(t, seen[id])
		}

		// Frontera exacta: 7 mensajes con limit 7 => hasMore=false; limit 6 => true.
		page, hasMore, err := groupRepo.GetGroupMessagesPage(g.ID, 0, 7, 0, ctx)
		require.NoError(t, err)
		assert.Len(t, page, 7)
		assert.False(t, hasMore)
		_, hasMore, err = groupRepo.GetGroupMessagesPage(g.ID, 0, 6, 0, ctx)
		require.NoError(t, err)
		assert.True(t, hasMore)
	})

	t.Run("calls only updatable by participants", func(t *testing.T) {
		require.NoError(t, contactRepo.CreateCallLog(&models.CallLog{CallerID: a.ID, ReceiverID: b.ID, RoomID: "room1", CallType: "audio", Status: "missed", StartedAt: time.Now()}, ctx))
		assert.Error(t, contactRepo.UpdateCallLogByRoomID("room1", c.ID, map[string]interface{}{"status": "answered"}, ctx))
		assert.NoError(t, contactRepo.UpdateCallLogByRoomID("room1", b.ID, map[string]interface{}{"status": "answered"}, ctx))
		assert.Error(t, contactRepo.DeleteCallLogForUser(1, c.ID, ctx))
		assert.NoError(t, contactRepo.DeleteCallLogForUser(1, a.ID, ctx))
	})

	t.Run("contacts cache invalidated on add", func(t *testing.T) {
		assert.Empty(t, contactRepo.GetCachedContactsTelephons(c.Telephon, ctx))
		require.NoError(t, contactRepo.AddContact(models.ContactDataBase{IdUser: a.ID, IdContact: c.ID, Status: "accepted", ContactName: "C"}, ctx))
		assert.Contains(t, contactRepo.GetCachedContactsTelephons(a.Telephon, ctx), c.Telephon)
		require.NoError(t, contactRepo.AddContact(models.ContactDataBase{IdUser: b.ID, IdContact: a.ID, Status: "accepted", ContactName: "A"}, ctx))
		assert.ElementsMatch(t, []string{c.Telephon, b.Telephon}, contactRepo.GetCachedContactsTelephons(a.Telephon, ctx))
	})

	t.Run("refresh tokens", func(t *testing.T) {
		require.NoError(t, userCache.SaveRefreshToken(a.Telephon, "t1", ctx))
		require.NoError(t, userCache.SaveRefreshToken(a.Telephon, "t2", ctx))
		owner, err := userCache.GetRefreshTokenOwner("t1", ctx)
		require.NoError(t, err)
		assert.Equal(t, a.Telephon, owner)

		require.NoError(t, userCache.DeleteRefreshToken("t1", ctx))
		_, err = userCache.GetRefreshTokenOwner("t1", ctx)
		assert.Error(t, err)

		require.NoError(t, userCache.RevokeAllRefreshTokens(a.Telephon, ctx))
		_, err = userCache.GetRefreshTokenOwner("t2", ctx)
		assert.Error(t, err)

		n, err := userCache.IncrIntentosFallidos("user1", ctx)
		require.NoError(t, err)
		assert.Equal(t, 1, n)
		n, _ = userCache.IncrIntentosFallidos("user1", ctx)
		assert.Equal(t, 2, n)
	})
}
