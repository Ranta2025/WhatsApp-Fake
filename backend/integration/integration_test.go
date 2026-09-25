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
