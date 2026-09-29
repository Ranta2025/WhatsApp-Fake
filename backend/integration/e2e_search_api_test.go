//go:build e2e

// API de búsqueda de mensajes end-to-end (HTTP + Postgres reales).
package integration

import (
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

func TestE2ESearchAPI(t *testing.T) {
	base := os.Getenv("E2E_BASE_URL")
	require.NotEmpty(t, base, "E2E_BASE_URL requerido")
	db, err := database.Conection()
	require.NoError(t, err)

	suffix := time.Now().UnixNano() % 1000000
	hash, err := utils.Hash("Passw0rd!")
	require.NoError(t, err)
	mk := func(name string, n int) models.UserDataBase {
		u := models.UserDataBase{User: models.User{
			Username: fmt.Sprintf("sa%s%d", name, suffix),
			Gmail:    fmt.Sprintf("sa%s%d@gmail.com", name, suffix),
			Telephon: fmt.Sprintf("+56%d%07d", n, suffix),
		}, Password: hash, Activo: true}
		require.NoError(t, db.Create(&u).Error)
		return u
	}
	alice, bob, carol := mk("alice", 1), mk("bob", 2), mk("carol", 3)
	login := func(u models.UserDataBase) *e2eClient {
		c := newClient(t, base)
		code, _ := c.do("POST", "/api/v1/auth/login", map[string]string{"username": u.Username, "password": "Passw0rd!"})
		require.Equal(t, 200, code)
		return c
	}
	ca, cc := login(alice), login(carol)

	now := time.Now()
	require.NoError(t, db.Create(&models.Message{IdUser: bob.ID, IdReceptor: alice.ID, Message: "Qué CANCIÓN tan buena", Status: "enviado", Time: now}).Error)
	require.NoError(t, db.Create(&models.Message{IdUser: alice.ID, IdReceptor: bob.ID, Message: "nada", Status: "enviado", Time: now}).Error)

	// Contactos y grupo (alice + bob; carol es ajena)
	code, _ := ca.do("POST", "/api/v1/contact", map[string]string{"number": bob.Telephon, "contact_name": "Bobby"})
	require.Equal(t, 201, code)
	code, grp := ca.do("POST", "/api/v1/group", map[string]interface{}{"name": "Buscadores", "members": []string{bob.Telephon}})
	require.Equal(t, 201, code, grp)
	groupID := uint(grp["group"].(map[string]interface{})["ID"].(float64))
	require.NoError(t, db.Create(&models.GroupMessage{GroupID: groupID, SenderID: bob.ID, Message: "otra canción en el grupo", Time: now}).Error)

	t.Run("chat search: shape, highlights, validation", func(t *testing.T) {
		code, out := ca.do("GET", "/api/v1/chat/"+bob.Telephon+"/search?q=cancion", nil)
		require.Equal(t, 200, code, out)
		results := out["results"].([]interface{})
		require.Len(t, results, 1)
		r := results[0].(map[string]interface{})
		assert.Equal(t, "Qué CANCIÓN tan buena", r["snippet"])
		assert.Equal(t, []interface{}{[]interface{}{4.0, 11.0}}, r["highlights"])
		assert.Equal(t, false, out["hasMore"])

		code, _ = ca.do("GET", "/api/v1/chat/"+bob.Telephon+"/search?q=c", nil)
		assert.Equal(t, 400, code)
		code, out = ca.do("GET", "/api/v1/chat/"+bob.Telephon+"/search?q=nadaquenoexiste", nil)
		require.Equal(t, 200, code)
		assert.Empty(t, out["results"])

		// contacto inexistente: 404 (no 500)
		code, _ = ca.do("GET", "/api/v1/chat/+5699999999999/search?q=cancion", nil)
		assert.Equal(t, 404, code)

		// carol no ve la conversación alice-bob
		code, out = cc.do("GET", "/api/v1/chat/"+bob.Telephon+"/search?q=cancion", nil)
		require.Equal(t, 200, code)
		assert.Empty(t, out["results"])
	})

	t.Run("group search: member ok, outsider 403, invalid 400", func(t *testing.T) {
		path := fmt.Sprintf("/api/v1/group/%d/message/search?q=CANCION", groupID)
		code, out := ca.do("GET", path, nil)
		require.Equal(t, 200, code, out)
		assert.Len(t, out["results"], 1)
		code, _ = cc.do("GET", path, nil)
		assert.Equal(t, 403, code)
		code, _ = ca.do("GET", fmt.Sprintf("/api/v1/group/%d/message/search?q=%%20a%%20", groupID), nil)
		assert.Equal(t, 400, code)
	})

	t.Run("global search groups by chat and respects membership", func(t *testing.T) {
		code, out := ca.do("GET", "/api/v1/search?q=cancion", nil)
		require.Equal(t, 200, code, out)
		chats := out["chats"].([]interface{})
		require.Len(t, chats, 2)
		kinds := map[string]map[string]interface{}{}
		for _, c := range chats {
			m := c.(map[string]interface{})
			kinds[m["kind"].(string)] = m
		}
		assert.Equal(t, bob.Telephon, kinds["direct"]["key"])
		assert.Equal(t, "Bobby", kinds["direct"]["name"])
		assert.Equal(t, fmt.Sprint(groupID), kinds["group"]["key"])
		assert.Equal(t, "Buscadores", kinds["group"]["name"])
		assert.EqualValues(t, 1, kinds["group"]["total"])

		code, out = cc.do("GET", "/api/v1/search?q=cancion", nil)
		require.Equal(t, 200, code)
		assert.Empty(t, out["chats"])
		code, _ = ca.do("GET", "/api/v1/search?q=x", nil)
		assert.Equal(t, 400, code)
	})
}
