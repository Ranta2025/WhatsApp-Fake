//go:build e2e

// Prueba end-to-end del silencio por chat (WP8) contra el stack real:
// silenciar un 1:1 y un grupo, ver el estado en los listados del sidebar
// (GET contact, GET chats, GET group), "para siempre" sin vencimiento,
// silencio vencido = no silenciado, quitar el silencio y 401/403/400.
//
//	E2E_BASE_URL=http://127.0.0.1:8080 go test -tags e2e ./backend/integration/
package integration

import (
	"encoding/json"
	"fmt"
	"gorm/backend/database"
	"gorm/backend/models"
	"gorm/backend/utils"
	"os"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// e2eListEntry busca en un listado JSON (array) la entrada cuyo campo key vale value.
func e2eListEntry(t *testing.T, items []map[string]interface{}, key, value string) map[string]interface{} {
	t.Helper()
	for _, it := range items {
		if it[key] == value {
			return it
		}
	}
	t.Fatalf("no hay entrada con %s=%s en %v", key, value, items)
	return nil
}

func e2eGetArray(t *testing.T, c *e2eClient, path string) []map[string]interface{} {
	t.Helper()
	res := c.raw("GET", path)
	require.Equal(t, 200, res.status, string(res.body))
	var out []map[string]interface{}
	require.NoError(t, json.Unmarshal(res.body, &out), string(res.body))
	return out
}

func e2eGroupEntry(t *testing.T, c *e2eClient, groupID uint) map[string]interface{} {
	t.Helper()
	code, body := c.do("GET", "/api/v1/group", nil)
	require.Equal(t, 200, code, body)
	for _, it := range body["groups"].([]interface{}) {
		g := it.(map[string]interface{})
		if uint(g["ID"].(float64)) == groupID {
			return g
		}
	}
	t.Fatalf("grupo %d no está en el listado: %v", groupID, body)
	return nil
}

// e2eAssertMutedUntil comprueba que mutedUntil es RFC3339 y cae a ~d de ahora.
func e2eAssertMutedUntil(t *testing.T, raw interface{}, d time.Duration) string {
	t.Helper()
	s, ok := raw.(string)
	require.True(t, ok, "mutedUntil debe ser string RFC3339: %v", raw)
	until, err := time.Parse(time.RFC3339, s)
	require.NoError(t, err)
	assert.WithinDuration(t, time.Now().Add(d), until, 2*time.Minute)
	return s
}

func TestE2EChatMute(t *testing.T) {
	base := os.Getenv("E2E_BASE_URL")
	require.NotEmpty(t, base, "E2E_BASE_URL requerido")
	db, err := database.Conection()
	require.NoError(t, err)

	suffix := time.Now().UnixNano() % 1000000
	hash, err := utils.Hash("Passw0rd!")
	require.NoError(t, err)
	mk := func(name string, n int) models.UserDataBase {
		u := models.UserDataBase{User: models.User{
			Username: fmt.Sprintf("mu%s%d", name, suffix),
			Gmail:    fmt.Sprintf("mu%s%d@gmail.com", name, suffix),
			Telephon: fmt.Sprintf("+55%d%07d", n, suffix),
		}, Password: hash, Activo: true}
		require.NoError(t, db.Create(&u).Error)
		return u
	}
	// ana is the shared session's user: /auth/login has no budget left for
	// another login (see sharedE2ESession). Only the users created here are
	// deleted; TestMain removes the shared one.
	ca, ana := sharedLogin(t)
	luis := mk("luis", 2)
	var groupID, foreignGroupID uint
	t.Cleanup(func() {
		ids := []uint{ana.ID, luis.ID}
		db.Exec(`DELETE FROM chat_mutes WHERE user_id IN ?`, ids)
		db.Exec(`DELETE FROM messages WHERE id_user IN ? OR id_receptor IN ?`, ids, ids)
		db.Exec(`DELETE FROM contact_data_bases WHERE id_user IN ? OR id_contact IN ?`, ids, ids)
		if groupID != 0 {
			db.Exec(`DELETE FROM group_messages WHERE group_id = ?`, groupID)
			db.Exec(`DELETE FROM group_members WHERE group_id = ?`, groupID)
			db.Exec(`DELETE FROM groups WHERE id = ?`, groupID)
		}
		if foreignGroupID != 0 {
			db.Exec(`DELETE FROM group_members WHERE group_id = ?`, foreignGroupID)
			db.Exec(`DELETE FROM groups WHERE id = ?`, foreignGroupID)
		}
		db.Exec(`DELETE FROM user_data_bases WHERE id = ?`, luis.ID)
	})

	chatMute := "/api/v1/chat/" + luis.Telephon + "/mute"

	// Sin cookie: 401 en todos los endpoints.
	anon := newClient(t, base)
	for _, r := range []struct{ method, path string }{
		{"PUT", chatMute}, {"DELETE", chatMute},
		{"PUT", "/api/v1/group/1/mute"}, {"DELETE", "/api/v1/group/1/mute"},
	} {
		code, _ := anon.do(r.method, r.path, map[string]string{"duration": "8h"})
		assert.Equal(t, 401, code, r.method+" "+r.path)
	}

	code, body := ca.do("POST", "/api/v1/contact", map[string]string{"telephon": luis.Telephon, "contactName": "Luis"})
	require.Equal(t, 201, code, body)
	// Un mensaje para que el 1:1 aparezca también en GET chats.
	require.NoError(t, db.Create(&models.Message{IdUser: luis.ID, IdReceptor: ana.ID, Message: "hola", Status: "enviado", Time: time.Now()}).Error)

	t.Run("1:1 durante 8h aparece en los listados", func(t *testing.T) {
		code, body := ca.do("PUT", chatMute, map[string]string{"duration": "8h"})
		require.Equal(t, 200, code, body)
		assert.Equal(t, true, body["muted"])
		until := e2eAssertMutedUntil(t, body["mutedUntil"], 8*time.Hour)

		contact := e2eListEntry(t, e2eGetArray(t, ca, "/api/v1/contact"), "telephon", luis.Telephon)
		assert.Equal(t, true, contact["muted"])
		assert.Equal(t, until, contact["mutedUntil"])
		chat := e2eListEntry(t, e2eGetArray(t, ca, "/api/v1/chats"), "ContactTelephon", luis.Telephon)
		assert.Equal(t, true, chat["Muted"])
		assert.Equal(t, until, chat["MutedUntil"])
	})

	t.Run("1:1 para siempre: mutedUntil null", func(t *testing.T) {
		code, body := ca.do("PUT", chatMute, map[string]string{"duration": "always"})
		require.Equal(t, 200, code, body)
		assert.Equal(t, true, body["muted"])
		v, present := body["mutedUntil"]
		assert.True(t, present, "mutedUntil presente")
		assert.Nil(t, v)

		contact := e2eListEntry(t, e2eGetArray(t, ca, "/api/v1/contact"), "telephon", luis.Telephon)
		assert.Equal(t, true, contact["muted"])
		assert.NotContains(t, contact, "mutedUntil")
	})

	t.Run("duración inválida y chat inexistente", func(t *testing.T) {
		code, _ := ca.do("PUT", chatMute, map[string]string{"duration": "2d"})
		assert.Equal(t, 400, code)
		code, _ = ca.do("PUT", "/api/v1/chat/+59999999999/mute", map[string]string{"duration": "8h"})
		assert.Equal(t, 404, code)
	})

	t.Run("silencio vencido se lee como no silenciado", func(t *testing.T) {
		code, body := ca.do("PUT", chatMute, map[string]string{"duration": "8h"})
		require.Equal(t, 200, code, body)
		require.NoError(t, db.Exec(`UPDATE chat_mutes SET muted_until = now() - interval '1 minute' WHERE user_id = ?`, ana.ID).Error)
		contact := e2eListEntry(t, e2eGetArray(t, ca, "/api/v1/contact"), "telephon", luis.Telephon)
		assert.NotContains(t, contact, "muted")
	})

	t.Run("quitar el silencio del 1:1 es idempotente", func(t *testing.T) {
		code, body := ca.do("PUT", chatMute, map[string]string{"duration": "1w"})
		require.Equal(t, 200, code, body)
		assert.Equal(t, 204, ca.raw("DELETE", chatMute).status)
		assert.Equal(t, 204, ca.raw("DELETE", chatMute).status)
		contact := e2eListEntry(t, e2eGetArray(t, ca, "/api/v1/contact"), "telephon", luis.Telephon)
		assert.NotContains(t, contact, "muted")
		assert.NotContains(t, contact, "mutedUntil")
	})

	t.Run("grupo: silenciar, para siempre, no miembro y quitar", func(t *testing.T) {
		code, grp := ca.do("POST", "/api/v1/group", map[string]interface{}{
			"name":    "Grupo silencio",
			"members": []string{luis.Telephon},
		})
		require.Equal(t, 201, code, grp)
		groupID = uint(grp["group"].(map[string]interface{})["ID"].(float64))
		groupMute := fmt.Sprintf("/api/v1/group/%d/mute", groupID)

		code, body := ca.do("PUT", groupMute, map[string]string{"duration": "1w"})
		require.Equal(t, 200, code, body)
		until := e2eAssertMutedUntil(t, body["mutedUntil"], 7*24*time.Hour)
		g := e2eGroupEntry(t, ca, groupID)
		assert.Equal(t, true, g["Muted"])
		assert.Equal(t, until, g["MutedUntil"])

		code, body = ca.do("PUT", groupMute, map[string]string{"duration": "always"})
		require.Equal(t, 200, code, body)
		v, present := body["mutedUntil"]
		assert.True(t, present)
		assert.Nil(t, v)
		g = e2eGroupEntry(t, ca, groupID)
		assert.Equal(t, true, g["Muted"])
		assert.NotContains(t, g, "MutedUntil")

		// A group ana is not a member of (created directly: no extra login).
		foreign := models.Group{Name: "Grupo ajeno", CreatorID: luis.ID}
		require.NoError(t, db.Create(&foreign).Error)
		foreignGroupID = foreign.ID
		require.NoError(t, db.Create(&models.GroupMember{GroupID: foreign.ID, UserID: luis.ID, Role: "admin", AddedByID: luis.ID}).Error)
		code, _ = ca.do("PUT", fmt.Sprintf("/api/v1/group/%d/mute", foreign.ID), map[string]string{"duration": "8h"})
		assert.Equal(t, 403, code, "no miembro")

		assert.Equal(t, 204, ca.raw("DELETE", groupMute).status)
		g = e2eGroupEntry(t, ca, groupID)
		assert.NotContains(t, g, "Muted")
	})
}
