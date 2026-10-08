//go:build e2e

// Acuses de lectura de grupo end-to-end (HTTP + WS + Postgres reales):
//
//	E2E_BASE_URL=http://127.0.0.1:8080 go test -tags e2e ./backend/integration/
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

func telephonsIn(t *testing.T, body map[string]interface{}, key string) []string {
	t.Helper()
	list, ok := body[key].([]interface{})
	require.True(t, ok, "%s debe ser una lista en %v", key, body)
	out := make([]string, 0, len(list))
	for _, item := range list {
		out = append(out, item.(map[string]interface{})["telephon"].(string))
	}
	return out
}

func TestE2EGroupReceipts(t *testing.T) {
	base := os.Getenv("E2E_BASE_URL")
	require.NotEmpty(t, base, "E2E_BASE_URL requerido")
	db, err := database.Conection()
	require.NoError(t, err)

	suffix := time.Now().UnixNano() % 1000000
	hash, err := utils.Hash("Passw0rd!")
	require.NoError(t, err)
	mk := func(name string, n int) models.UserDataBase {
		u := models.UserDataBase{User: models.User{
			Username: fmt.Sprintf("rr%s%d", name, suffix),
			Gmail:    fmt.Sprintf("rr%s%d@gmail.com", name, suffix),
			Telephon: fmt.Sprintf("+58%d%07d", n, suffix),
		}, Password: hash, Activo: true}
		require.NoError(t, db.Create(&u).Error)
		return u
	}
	alice, bob, carol := mk("alice", 1), mk("bob", 2), mk("carol", 3)
	outsider := mk("dave", 4)

	login := func(u models.UserDataBase) *e2eClient {
		c := newClient(t, base)
		code, _ := c.do("POST", "/api/v1/auth/login", map[string]string{"username": u.Username, "password": "Passw0rd!"})
		require.Equal(t, 200, code)
		return c
	}
	ca, cb, cc, cd := login(alice), login(bob), login(carol), login(outsider)

	for _, contact := range []models.UserDataBase{bob, carol} {
		code, _ := ca.do("POST", "/api/v1/contact", map[string]string{"telephon": contact.Telephon, "contactName": contact.Username})
		require.Equal(t, 201, code)
	}
	code, grp := ca.do("POST", "/api/v1/group", map[string]interface{}{"name": "Acuses", "members": []string{bob.Telephon, carol.Telephon}})
	require.Equal(t, 201, code, grp)
	groupID := int(grp["group"].(map[string]interface{})["ID"].(float64))

	wsAlice, wsBob, wsCarol := ca.ws(""), cb.ws(""), cc.ws("")
	defer wsAlice.Close()
	defer wsBob.Close()
	defer wsCarol.Close()
	time.Sleep(300 * time.Millisecond) // initClient une a las rooms

	send := func(ws interface{ WriteJSON(v interface{}) error }, typ string, payload map[string]interface{}) {
		require.NoError(t, ws.WriteJSON(map[string]interface{}{"type": typ, "payload": payload}))
	}

	send(wsAlice, "group_chat", map[string]interface{}{"groupID": groupID, "message": "hola acuses"})
	own := waitFor(t, wsAlice, "group_chat")
	messageID := int(own["payload"].(map[string]interface{})["MessageID"].(float64))
	receiptsPath := fmt.Sprintf("/api/v1/group/%d/message/%d/receipts", groupID, messageID)

	// Sin acuses todavía: los dos miembros están pendientes
	code, r := ca.do("GET", receiptsPath, nil)
	require.Equal(t, 200, code, r)
	assert.ElementsMatch(t, []string{bob.Telephon, carol.Telephon}, telephonsIn(t, r, "pending"))
	assert.Empty(t, telephonsIn(t, r, "readBy"))

	// Bob acusa entrega y lectura -> Alice recibe group_receipt
	waitFor(t, wsBob, "group_chat")
	send(wsBob, "group_delivered", map[string]interface{}{"groupID": groupID, "messageID": messageID})
	ev := waitFor(t, wsAlice, "group_receipt")
	p := ev["payload"].(map[string]interface{})
	assert.Equal(t, bob.Telephon, p["telephon"])
	assert.EqualValues(t, messageID, p["deliveredUpTo"])

	send(wsBob, "group_read", map[string]interface{}{"groupID": groupID, "upToMessageID": messageID})
	ev = waitFor(t, wsAlice, "group_receipt")
	assert.EqualValues(t, messageID, ev["payload"].(map[string]interface{})["readUpTo"])

	code, r = ca.do("GET", receiptsPath, nil)
	require.Equal(t, 200, code)
	assert.Equal(t, []string{bob.Telephon}, telephonsIn(t, r, "readBy"))
	assert.Equal(t, []string{carol.Telephon}, telephonsIn(t, r, "pending"))

	// Carol solo entregado
	waitFor(t, wsCarol, "group_chat")
	send(wsCarol, "group_delivered", map[string]interface{}{"groupID": groupID, "messageID": messageID})
	waitFor(t, wsAlice, "group_receipt")
	code, r = ca.do("GET", receiptsPath, nil)
	require.Equal(t, 200, code)
	assert.Equal(t, []string{carol.Telephon}, telephonsIn(t, r, "deliveredTo"))
	assert.Empty(t, telephonsIn(t, r, "pending"))

	// Solo el autor puede ver los acuses; un ajeno al grupo tampoco
	code, _ = cb.do("GET", receiptsPath, nil)
	assert.Equal(t, 403, code, "un miembro que no es el autor no puede ver los acuses")
	code, _ = cd.do("GET", receiptsPath, nil)
	assert.Equal(t, 403, code, "un no miembro no puede ver los acuses")
	code, _ = ca.do("GET", fmt.Sprintf("/api/v1/group/%d/message/%d/receipts", groupID, messageID+100000), nil)
	assert.Equal(t, 404, code)

	// Un no miembro no puede acusar: su group_read no altera nada
	wsDave := cd.ws("")
	defer wsDave.Close()
	send(wsDave, "group_read", map[string]interface{}{"groupID": groupID, "upToMessageID": messageID})
	time.Sleep(300 * time.Millisecond)
	code, r = ca.do("GET", receiptsPath, nil)
	require.Equal(t, 200, code)
	assert.Equal(t, []string{bob.Telephon}, telephonsIn(t, r, "readBy"))

	// El detalle del grupo expone las marcas de agua de cada miembro
	code, detail := ca.do("GET", fmt.Sprintf("/api/v1/group/%d", groupID), nil)
	require.Equal(t, 200, code)
	var bobRead float64
	for _, m := range detail["Members"].([]interface{}) {
		mm := m.(map[string]interface{})
		if mm["Telephon"] == bob.Telephon {
			bobRead, _ = mm["LastReadMessageID"].(float64)
		}
	}
	assert.EqualValues(t, messageID, bobRead)
}
