//go:build e2e

// Idempotent sends keyed by clientID (PW8) end to end: repository upsert and
// race against real Postgres, plus WS 1:1 / WS group / REST group replays that
// must store one message and deliver it to receivers once.
package integration

import (
	"context"
	"crypto/rand"
	"fmt"
	"gorm/backend/database"
	"gorm/backend/models"
	"gorm/backend/repos"
	"gorm/backend/utils"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// newClientID returns a random UUID v4 string.
func newClientID(t *testing.T) string {
	t.Helper()
	b := make([]byte, 16)
	_, err := rand.Read(b)
	require.NoError(t, err)
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

func TestE2EClientIDIdempotentSends(t *testing.T) {
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
			Username: fmt.Sprintf("ci%s%d", name, suffix),
			Gmail:    fmt.Sprintf("ci%s%d@gmail.com", name, suffix),
			Telephon: fmt.Sprintf("+59%d%07d", n, suffix),
		}, Password: hash, Activo: true}
		require.NoError(t, db.Create(&u).Error)
		return u
	}
	ana, luis := mk("ana", 1), mk("luis", 2)

	countDirect := func(sender uint, cid string) int64 {
		var n int64
		require.NoError(t, db.Unscoped().Model(&models.Message{}).Where("id_user = ? AND client_id = ?", sender, cid).Count(&n).Error)
		return n
	}
	countGroup := func(sender uint, cid string) int64 {
		var n int64
		require.NoError(t, db.Unscoped().Model(&models.GroupMessage{}).Where("sender_id = ? AND client_id = ?", sender, cid).Count(&n).Error)
		return n
	}

	ca, cl := e2eLogin(t, base, ana), e2eLogin(t, base, luis)
	code, body := ca.do("POST", "/api/v1/contact", map[string]string{"telephon": luis.Telephon, "contactName": luis.Username})
	require.Equal(t, 201, code, body)
	code, grp := ca.do("POST", "/api/v1/group", map[string]interface{}{"name": "PW8", "members": []string{luis.Telephon}})
	require.Equal(t, 201, code, grp)
	groupID := uint(grp["group"].(map[string]interface{})["ID"].(float64))
	require.NotZero(t, groupID)

	t.Run("repo: concurrent 1:1 inserts with one clientID store one row", func(t *testing.T) {
		cid := newClientID(t)
		const n = 8
		var wg sync.WaitGroup
		ids := make([]uint, n)
		dups := make([]bool, n)
		errs := make([]error, n)
		for i := 0; i < n; i++ {
			wg.Add(1)
			go func(i int) {
				defer wg.Done()
				c := cid
				m := models.Message{IdUser: ana.ID, IdReceptor: luis.ID, Message: "race", Status: "enviado", Time: time.Now(), ClientID: &c}
				dups[i], errs[i] = contactRepo.CreateMessageIdempotent(&m, ctx)
				ids[i] = m.ID
			}(i)
		}
		wg.Wait()
		fresh := 0
		for i := 0; i < n; i++ {
			require.NoError(t, errs[i])
			assert.Equal(t, ids[0], ids[i], "every caller sees the same row")
			if !dups[i] {
				fresh++
			}
		}
		assert.Equal(t, 1, fresh, "exactly one insert wins")
		assert.EqualValues(t, 1, countDirect(ana.ID, cid))
	})

	t.Run("repo: concurrent group inserts with one clientID store one row", func(t *testing.T) {
		cid := newClientID(t)
		const n = 8
		var wg sync.WaitGroup
		ids := make([]uint, n)
		dups := make([]bool, n)
		errs := make([]error, n)
		for i := 0; i < n; i++ {
			wg.Add(1)
			go func(i int) {
				defer wg.Done()
				c := cid
				m := models.GroupMessage{GroupID: groupID, SenderID: ana.ID, Message: "race", Time: time.Now(), ClientID: &c}
				dups[i], errs[i] = groupRepo.CreateGroupMessageIdempotent(&m, ctx)
				ids[i] = m.ID
			}(i)
		}
		wg.Wait()
		fresh := 0
		for i := 0; i < n; i++ {
			require.NoError(t, errs[i])
			assert.Equal(t, ids[0], ids[i])
			if !dups[i] {
				fresh++
			}
		}
		assert.Equal(t, 1, fresh)
		assert.EqualValues(t, 1, countGroup(ana.ID, cid))
	})

	wsAna, wsLuis := ca.ws(""), cl.ws("")
	t.Cleanup(func() { _ = wsAna.Close(); _ = wsLuis.Close() })
	time.Sleep(300 * time.Millisecond) // initClient joins existing rooms
	anaEv, luisEv := newEvStream(wsAna), newEvStream(wsLuis)
	sendWS := func(conn *websocket.Conn, typ string, payload map[string]interface{}) {
		require.NoError(t, conn.WriteJSON(map[string]interface{}{"type": typ, "payload": payload}))
	}

	t.Run("ws chat: replay echoes the same message to the sender only", func(t *testing.T) {
		cid := newClientID(t)
		payload := map[string]interface{}{"receptor": luis.Telephon, "message": "offline hola", "clientID": strings.ToUpper(cid)}

		sendWS(wsAna, "chat", payload)
		first := anaEv.wait(t, "chat")["payload"].(map[string]interface{})
		delivered := luisEv.wait(t, "chat")["payload"].(map[string]interface{})
		assert.Equal(t, first["MessageID"], delivered["MessageID"])
		assert.Equal(t, cid, first["ClientID"], "clientID normalized to lowercase and echoed")

		sendWS(wsAna, "chat", payload)
		second := anaEv.wait(t, "chat")["payload"].(map[string]interface{})
		assert.Equal(t, first["MessageID"], second["MessageID"])
		assert.Equal(t, first["Time"], second["Time"])
		assert.Equal(t, cid, second["ClientID"])
		luisEv.none(t, "chat", 700*time.Millisecond)
		assert.EqualValues(t, 1, countDirect(ana.ID, cid))
	})

	t.Run("ws chat: invalid clientID is rejected", func(t *testing.T) {
		sendWS(wsAna, "chat", map[string]interface{}{"receptor": luis.Telephon, "message": "x", "clientID": "not-a-uuid"})
		ev := anaEv.wait(t, "error")
		assert.Contains(t, ev["error"], "clientID")
		luisEv.none(t, "chat", 500*time.Millisecond)
	})

	t.Run("ws group_chat: replay is not broadcast again", func(t *testing.T) {
		cid := newClientID(t)
		payload := map[string]interface{}{"groupID": groupID, "message": "grupo offline", "clientID": cid}

		sendWS(wsAna, "group_chat", payload)
		first := anaEv.wait(t, "group_chat")["payload"].(map[string]interface{})
		delivered := luisEv.wait(t, "group_chat")["payload"].(map[string]interface{})
		assert.Equal(t, first["MessageID"], delivered["MessageID"])

		sendWS(wsAna, "group_chat", payload)
		second := anaEv.wait(t, "group_chat")["payload"].(map[string]interface{})
		assert.Equal(t, first["MessageID"], second["MessageID"])
		assert.Equal(t, cid, second["ClientID"])
		luisEv.none(t, "group_chat", 700*time.Millisecond)
		assert.EqualValues(t, 1, countGroup(ana.ID, cid))
	})

	t.Run("rest group send: 201 then 200 with the same message, one broadcast", func(t *testing.T) {
		cid := newClientID(t)
		path := fmt.Sprintf("/api/v1/group/%d/message", groupID)
		req := map[string]interface{}{"groupID": groupID, "message": "rest offline", "clientID": cid}

		code, first := ca.do("POST", path, req)
		require.Equal(t, 201, code, first)
		luisEv.wait(t, "group_chat")

		code, second := ca.do("POST", path, req)
		require.Equal(t, 200, code, second)
		f, s := first["message"].(map[string]interface{}), second["message"].(map[string]interface{})
		assert.Equal(t, f["MessageID"], s["MessageID"])
		assert.Equal(t, cid, s["ClientID"])
		luisEv.none(t, "group_chat", 700*time.Millisecond)
		assert.EqualValues(t, 1, countGroup(ana.ID, cid))

		code, bad := ca.do("POST", path, map[string]interface{}{"groupID": groupID, "message": "x", "clientID": "nope"})
		assert.Equal(t, 400, code, bad)
	})
}
