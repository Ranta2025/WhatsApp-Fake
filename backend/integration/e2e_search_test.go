//go:build e2e

// Búsqueda de mensajes contra PostgreSQL real (pg_trgm + unaccent):
//
//	POSTGRES_* ... go test -tags e2e ./backend/integration/ -run Search
package integration

import (
	"context"
	"fmt"
	"gorm/backend/database"
	"gorm/backend/models"
	"gorm/backend/repos"
	"gorm/backend/utils"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func searchTexts(rows []models.SearchRow) []string {
	out := make([]string, 0, len(rows))
	for _, r := range rows {
		out = append(out, r.Message)
	}
	return out
}

func TestE2EMessageSearch(t *testing.T) {
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
			Username: fmt.Sprintf("sr%s%d", name, suffix),
			Gmail:    fmt.Sprintf("sr%s%d@gmail.com", name, suffix),
			Telephon: fmt.Sprintf("+57%d%07d", n, suffix),
		}, Password: hash, Activo: true}
		require.NoError(t, db.Create(&u).Error)
		return u
	}
	alice, bob, carol, dave := mk("alice", 1), mk("bob", 2), mk("carol", 3), mk("dave", 4)

	now := time.Now()
	send := func(from, to models.UserDataBase, text string) models.Message {
		m := models.Message{IdUser: from.ID, IdReceptor: to.ID, Message: text, Status: "enviado", Time: now}
		require.NoError(t, db.Create(&m).Error)
		return m
	}

	t.Run("direct: accents, case, partial", func(t *testing.T) {
		send(alice, bob, "Mi canción favorita")
		send(bob, alice, "CANCION otra")
		send(alice, bob, "nada que ver")
		for _, q := range []string{"cancion", "CANCIÓN", "canci", "ión fav"} {
			rows, hasMore, err := contactRepo.SearchMessages(alice.ID, bob.ID, q, 0, 20, ctx)
			require.NoError(t, err, q)
			assert.False(t, hasMore)
			if q == "ión fav" {
				assert.Equal(t, []string{"Mi canción favorita"}, searchTexts(rows), q)
			} else if q == "canci" || q == "cancion" || q == "CANCIÓN" {
				assert.Equal(t, []string{"CANCION otra", "Mi canción favorita"}, searchTexts(rows), q)
			}
		}
		// El otro extremo ve lo mismo
		rows, _, err := contactRepo.SearchMessages(bob.ID, alice.ID, "cancion", 0, 20, ctx)
		require.NoError(t, err)
		assert.Len(t, rows, 2)
		// Un tercero no ve nada
		rows, _, err = contactRepo.SearchMessages(carol.ID, bob.ID, "cancion", 0, 20, ctx)
		require.NoError(t, err)
		assert.Empty(t, rows)
	})

	t.Run("direct: LIKE wildcards are literal", func(t *testing.T) {
		send(alice, carol, "descuento del 50% hoy")
		send(alice, carol, "abc def")
		send(alice, carol, "snake_case")
		send(alice, carol, `ruta c:\temp`)
		for q, want := range map[string]string{
			"0%":  "descuento del 50% hoy",
			"e_c": "snake_case",
			`c:\`: `ruta c:\temp`,
		} {
			rows, _, err := contactRepo.SearchMessages(alice.ID, carol.ID, q, 0, 20, ctx)
			require.NoError(t, err, q)
			assert.Equal(t, []string{want}, searchTexts(rows), q)
		}
		// "%%" y "_" solos no son comodines
		rows, _, err := contactRepo.SearchMessages(alice.ID, carol.ID, "%%", 0, 20, ctx)
		require.NoError(t, err)
		assert.Empty(t, rows)
		rows, _, err = contactRepo.SearchMessages(alice.ID, carol.ID, "a_", 0, 20, ctx)
		require.NoError(t, err)
		assert.Empty(t, rows, "a_ no debe comportarse como 'a' + cualquier carácter")
	})

	t.Run("direct: media, soft delete and per-user delete are excluded", func(t *testing.T) {
		media := models.Message{IdUser: alice.ID, IdReceptor: dave.ID, Message: "zzmedia foto", MediaType: "image", MediaUrl: "/x.png", Status: "enviado", Time: now}
		require.NoError(t, db.Create(&media).Error)
		gone := send(alice, dave, "zzgone borrado")
		require.NoError(t, db.Delete(&gone).Error)
		mine := send(alice, dave, "zzmine oculto para alice")
		require.NoError(t, db.Model(&models.Message{}).Where("id = ?", mine.ID).Update("deleted_by_sender", true).Error)
		theirs := send(dave, alice, "zztheirs oculto para alice receptor")
		require.NoError(t, db.Model(&models.Message{}).Where("id = ?", theirs.ID).Update("deleted_by_receiver", true).Error)
		visible := send(alice, dave, "zzvisible")

		rows, _, err := contactRepo.SearchMessages(alice.ID, dave.ID, "zz", 0, 20, ctx)
		require.NoError(t, err)
		assert.Equal(t, []string{"zzvisible"}, searchTexts(rows))
		// Dave sí ve lo que Alice ocultó solo para sí (los borrados por Alice no le afectan)
		rows, _, err = contactRepo.SearchMessages(dave.ID, alice.ID, "zz", 0, 20, ctx)
		require.NoError(t, err)
		assert.ElementsMatch(t, []string{"zzmine oculto para alice", "zztheirs oculto para alice receptor", "zzvisible"}, searchTexts(rows))
		_ = visible
	})

	t.Run("direct: pagination by id", func(t *testing.T) {
		for i := 0; i < 5; i++ {
			send(bob, carol, fmt.Sprintf("pagtok %d", i))
		}
		first, hasMore, err := contactRepo.SearchMessages(bob.ID, carol.ID, "pagtok", 0, 2, ctx)
		require.NoError(t, err)
		assert.True(t, hasMore)
		assert.Equal(t, []string{"pagtok 4", "pagtok 3"}, searchTexts(first))
		next, hasMore, err := contactRepo.SearchMessages(bob.ID, carol.ID, "pagtok", first[len(first)-1].ID, 2, ctx)
		require.NoError(t, err)
		assert.True(t, hasMore)
		assert.Equal(t, []string{"pagtok 2", "pagtok 1"}, searchTexts(next))
		last, hasMore, err := contactRepo.SearchMessages(bob.ID, carol.ID, "pagtok", next[len(next)-1].ID, 2, ctx)
		require.NoError(t, err)
		assert.False(t, hasMore)
		assert.Equal(t, []string{"pagtok 0"}, searchTexts(last))
	})

	// ── Grupos ────────────────────────────────────────────────────────────────
	group := models.Group{Name: fmt.Sprintf("srch%d", suffix), CreatorID: alice.ID}
	require.NoError(t, groupRepo.CreateGroupWithMembers(&group, alice.ID, []uint{bob.ID}, ctx))
	gsend := func(from models.UserDataBase, text, media string) models.GroupMessage {
		m := models.GroupMessage{GroupID: group.ID, SenderID: from.ID, Message: text, MediaType: media, Time: now}
		require.NoError(t, db.Create(&m).Error)
		return m
	}

	t.Run("group: members only, accents, media and deletes", func(t *testing.T) {
		gsend(alice, "Reunión de equipo", "")
		gsend(bob, "reunion cancelada", "")
		gsend(bob, "reunion foto", "image")
		gone := gsend(alice, "reunion borrada", "")
		require.NoError(t, db.Delete(&gone).Error)

		rows, hasMore, err := groupRepo.SearchGroupMessages(group.ID, alice.ID, "REUNIÓN", 0, 20, ctx)
		require.NoError(t, err)
		assert.False(t, hasMore)
		assert.Equal(t, []string{"reunion cancelada", "Reunión de equipo"}, searchTexts(rows))

		rows, _, err = groupRepo.SearchGroupMessages(group.ID, carol.ID, "reunion", 0, 20, ctx)
		require.NoError(t, err)
		assert.Empty(t, rows, "un no miembro no obtiene resultados")
	})

	t.Run("group: leaving removes access", func(t *testing.T) {
		require.NoError(t, groupRepo.LeaveGroup(group.ID, bob.ID, ctx))
		rows, _, err := groupRepo.SearchGroupMessages(group.ID, bob.ID, "reunion", 0, 20, ctx)
		require.NoError(t, err)
		assert.Empty(t, rows)
		rows, _, err = groupRepo.SearchGroupMessages(group.ID, alice.ID, "reunion", 0, 20, ctx)
		require.NoError(t, err)
		assert.NotEmpty(t, rows)
	})

	t.Run("global: grouped per chat, capped, ordered by recency, membership respected", func(t *testing.T) {
		// Alice: 1:1 con bob (2 "cancion"), grupo (reunión x2), 1:1 con carol nada de "cancion"
		for i := 0; i < 4; i++ {
			send(alice, dave, fmt.Sprintf("globtok dave %d", i))
		}
		send(alice, bob, "globtok bob")
		gsend(alice, "globtok grupo", "")

		direct, err := contactRepo.SearchMessagesGlobal(alice.ID, "globtok", 3, 20, ctx)
		require.NoError(t, err)
		// Chat más reciente primero (bob), luego dave con 3 de 4
		require.Len(t, direct, 1+3)
		assert.Equal(t, bob.ID, direct[0].ChatID)
		assert.Equal(t, 1, direct[0].Total)
		assert.Equal(t, dave.ID, direct[1].ChatID)
		assert.Equal(t, 4, direct[1].Total)
		assert.Equal(t, "globtok dave 3", direct[1].Message)
		assert.Equal(t, "globtok dave 1", direct[3].Message)

		// maxChats corta por chats, no por filas
		direct, err = contactRepo.SearchMessagesGlobal(alice.ID, "globtok", 3, 1, ctx)
		require.NoError(t, err)
		require.Len(t, direct, 1)
		assert.Equal(t, bob.ID, direct[0].ChatID)

		groups, err := groupRepo.SearchGroupMessagesGlobal(alice.ID, "globtok", 3, 20, ctx)
		require.NoError(t, err)
		require.Len(t, groups, 1)
		assert.Equal(t, group.ID, groups[0].ChatID)
		assert.Equal(t, 1, groups[0].Total)

		// Bob ya salió del grupo: solo ve su 1:1
		groups, err = groupRepo.SearchGroupMessagesGlobal(bob.ID, "globtok", 3, 20, ctx)
		require.NoError(t, err)
		assert.Empty(t, groups)
		direct, err = contactRepo.SearchMessagesGlobal(bob.ID, "globtok", 3, 20, ctx)
		require.NoError(t, err)
		require.Len(t, direct, 1)
		assert.Equal(t, alice.ID, direct[0].ChatID)

		// Dave no ve el "globtok" de bob/grupo
		groups, err = groupRepo.SearchGroupMessagesGlobal(dave.ID, "globtok", 3, 20, ctx)
		require.NoError(t, err)
		assert.Empty(t, groups)
	})

	t.Run("fallback ILIKE clause works but is accent-sensitive", func(t *testing.T) {
		count := func(q string) int64 {
			var n int64
			require.NoError(t, db.Table("messages").
				Where("id_user = ? AND id_receptor = ?", alice.ID, bob.ID).
				Where(repos.SearchMatchSQL(false), utils.EscapeLike(q)).Count(&n).Error)
			return n
		}
		assert.EqualValues(t, 1, count("CANCIÓN"), "case-insensitive")
		assert.EqualValues(t, 0, count("cancion"), "sin unaccent no ignora acentos ('CANCION otra' es de bob)")
	})

	t.Run("planner uses the partial trigram index", func(t *testing.T) {
		err := db.Transaction(func(tx *gorm.DB) error {
			require.NoError(t, tx.Exec("SET LOCAL enable_seqscan = off").Error)
			var plan []string
			require.NoError(t, tx.Raw(`EXPLAIN SELECT id FROM messages
				WHERE deleted_at IS NULL AND COALESCE(media_type,'') = ''
				AND norm(message) LIKE '%' || norm(?) || '%' ESCAPE '\'`, "cancion").Scan(&plan).Error)
			joined := ""
			for _, l := range plan {
				joined += l + "\n"
			}
			assert.Contains(t, joined, "idx_messages_search_trgm", joined)
			return nil
		})
		require.NoError(t, err)
	})
}
