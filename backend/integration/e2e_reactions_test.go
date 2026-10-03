//go:build e2e

// Reacciones end-to-end (HTTP + WS + Postgres reales):
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

	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// evStream lee un WS en una goroutine para poder esperar eventos y comprobar
// que NO llega ninguno sin romper la conexión (un timeout de lectura de gorilla
// deja la conexión inservible).
type evStream struct {
	conn *websocket.Conn
	ch   chan map[string]interface{}
}

func newEvStream(conn *websocket.Conn) *evStream {
	s := &evStream{conn: conn, ch: make(chan map[string]interface{}, 256)}
	go func() {
		defer close(s.ch)
		for {
			_, msg, err := conn.ReadMessage()
			if err != nil {
				return
			}
			var ev map[string]interface{}
			if json.Unmarshal(msg, &ev) == nil {
				s.ch <- ev
			}
		}
	}()
	return s
}

// wait devuelve el siguiente evento del tipo dado (descarta los demás).
func (s *evStream) wait(t *testing.T, eventType string) map[string]interface{} {
	t.Helper()
	timeout := time.After(5 * time.Second)
	for {
		select {
		case ev, ok := <-s.ch:
			require.True(t, ok, "WS cerrado esperando %s", eventType)
			if ev["type"] == eventType {
				return ev
			}
		case <-timeout:
			t.Fatalf("no llegó el evento %s", eventType)
		}
	}
}

// none comprueba que durante `wait` no llega ningún evento del tipo dado.
func (s *evStream) none(t *testing.T, eventType string, wait time.Duration) {
	t.Helper()
	timeout := time.After(wait)
	for {
		select {
		case ev, ok := <-s.ch:
			if !ok {
				return
			}
			require.NotEqual(t, eventType, ev["type"], "no debía llegar %s: %v", eventType, ev)
		case <-timeout:
			return
		}
	}
}

// reactionSummaries extrae Reactions de un mensaje de la historia.
func reactionSummaries(m map[string]interface{}) []map[string]interface{} {
	list, _ := m["Reactions"].([]interface{})
	out := make([]map[string]interface{}, 0, len(list))
	for _, r := range list {
		out = append(out, r.(map[string]interface{}))
	}
	return out
}

func TestE2EReactions(t *testing.T) {
	base := os.Getenv("E2E_BASE_URL")
	require.NotEmpty(t, base, "E2E_BASE_URL requerido")
	db, err := database.Conection()
	require.NoError(t, err)

	suffix := time.Now().UnixNano() % 1000000
	hash, err := utils.Hash("Passw0rd!")
	require.NoError(t, err)
	mk := func(name string, n int) models.UserDataBase {
		u := models.UserDataBase{User: models.User{
			Username: fmt.Sprintf("re%s%d", name, suffix),
			Gmail:    fmt.Sprintf("re%s%d@gmail.com", name, suffix),
			Telephon: fmt.Sprintf("+57%d%07d", n, suffix),
		}, Password: hash, Activo: true}
		require.NoError(t, db.Create(&u).Error)
		return u
	}
	alice, bob, carol := mk("alice", 1), mk("bob", 2), mk("carol", 3) // carol: ajena al 1:1 y al grupo

	login := func(u models.UserDataBase) *e2eClient {
		c := newClient(t, base)
		code, _ := c.do("POST", "/api/v1/auth/login", map[string]string{"username": u.Username, "password": "Passw0rd!"})
		require.Equal(t, 200, code)
		return c
	}
	ca, cb, cc := login(alice), login(bob), login(carol)

	code, _ := cb.do("POST", "/api/v1/contact", map[string]string{"number": alice.Telephon, "contact_name": "Alice"})
	require.Equal(t, 201, code)
	code, _ = ca.do("POST", "/api/v1/contact", map[string]string{"number": bob.Telephon, "contact_name": "Bob"})
	require.Equal(t, 201, code)
	code, grp := ca.do("POST", "/api/v1/group", map[string]interface{}{"name": "Reacciones", "members": []string{bob.Telephon}})
	require.Equal(t, 201, code, grp)
	groupID := int(grp["group"].(map[string]interface{})["ID"].(float64))

	rawA, rawB, rawC := ca.ws(""), cb.ws(""), cc.ws("")
	wsA, wsB, wsC := newEvStream(rawA), newEvStream(rawB), newEvStream(rawC)
	defer rawA.Close()
	defer rawB.Close()
	defer rawC.Close()
	time.Sleep(300 * time.Millisecond) // initClient une a las rooms

	react := func(ws *evStream, payload map[string]interface{}) {
		require.NoError(t, ws.conn.WriteJSON(map[string]interface{}{"type": "react", "payload": payload}))
	}

	// ── 1:1 ────────────────────────────────────────────────────────────────
	text := fmt.Sprintf("mensaje de bob %d", suffix)
	require.NoError(t, rawB.WriteJSON(map[string]interface{}{"type": "chat", "payload": map[string]string{"receptor": alice.Telephon, "message": text}}))
	sent := wsB.wait(t, "chat")
	directID := int(sent["payload"].(map[string]interface{})["MessageID"].(float64))
	wsA.wait(t, "chat")

	t.Run("1:1 reaccionar: el autor recibe el evento con authorTelephon y preview", func(t *testing.T) {
		react(wsA, map[string]interface{}{"kind": "direct", "messageID": directID, "emoji": "👍"})
		ev := wsB.wait(t, "reaction")["payload"].(map[string]interface{})
		assert.Equal(t, "direct", ev["kind"])
		assert.EqualValues(t, directID, ev["messageID"])
		assert.Equal(t, alice.Telephon, ev["telephon"])
		assert.Equal(t, alice.Username, ev["username"])
		assert.Equal(t, "👍", ev["emoji"])
		assert.Equal(t, bob.Telephon, ev["authorTelephon"])
		assert.Equal(t, text, ev["preview"])
		// el actor recibe su propia confirmación
		own := wsA.wait(t, "reaction")["payload"].(map[string]interface{})
		assert.Equal(t, "👍", own["emoji"])
		// ajenos al chat no reciben nada
		wsC.none(t, "reaction", 300*time.Millisecond)
	})

	history := func(c *e2eClient) map[string]interface{} {
		peer := bob.Telephon
		if c == cb {
			peer = alice.Telephon
		}
		resp := c.raw("GET", "/api/v1/chat/"+peer)
		require.Equal(t, 200, resp.status, string(resp.body))
		var msgs []map[string]interface{} // la historia 1:1 es una lista plana de Message
		require.NoError(t, json.Unmarshal(resp.body, &msgs), string(resp.body))
		for _, mm := range msgs {
			if int(mm["MessageID"].(float64)) == directID {
				return mm
			}
		}
		t.Fatalf("mensaje %d no está en la historia", directID)
		return nil
	}

	t.Run("1:1 reemplazar: una sola reacción con Mine correcto para cada lado", func(t *testing.T) {
		react(wsA, map[string]interface{}{"kind": "direct", "messageID": directID, "emoji": "❤️"})
		ev := wsB.wait(t, "reaction")["payload"].(map[string]interface{})
		assert.Equal(t, "❤️", ev["emoji"])
		assert.Equal(t, "👍", ev["previousEmoji"], "el reemplazo informa el emoji anterior")

		fromA := reactionSummaries(history(ca))
		require.Len(t, fromA, 1)
		assert.Equal(t, "❤️", fromA[0]["Emoji"])
		assert.EqualValues(t, 1, fromA[0]["Count"])
		assert.Equal(t, true, fromA[0]["Mine"])
		fromB := reactionSummaries(history(cb))
		require.Len(t, fromB, 1)
		assert.Equal(t, "❤️", fromB[0]["Emoji"])
		assert.Equal(t, false, fromB[0]["Mine"])
	})

	t.Run("1:1 repetir el mismo emoji es un no-op sin difusión", func(t *testing.T) {
		wsA.wait(t, "reaction") // confirmación del reemplazo anterior
		react(wsA, map[string]interface{}{"kind": "direct", "messageID": directID, "emoji": "❤️"})
		wsB.none(t, "reaction", 400*time.Millisecond)
	})

	t.Run("1:1 quitar: evento con emoji vacío y la historia queda sin Reactions", func(t *testing.T) {
		react(wsA, map[string]interface{}{"kind": "direct", "messageID": directID, "emoji": ""})
		ev := wsB.wait(t, "reaction")["payload"].(map[string]interface{})
		assert.Equal(t, "", ev["emoji"])
		assert.Equal(t, "❤️", ev["previousEmoji"], "quitar informa el emoji que tenía")
		assert.Empty(t, reactionSummaries(history(ca)))
		assert.Empty(t, reactionSummaries(history(cb)))

		// quitar de nuevo no difunde
		wsA.wait(t, "reaction")
		react(wsA, map[string]interface{}{"kind": "direct", "messageID": directID, "emoji": ""})
		wsB.none(t, "reaction", 400*time.Millisecond)
	})

	t.Run("1:1 emoji inválido responde error con contexto y no se persiste", func(t *testing.T) {
		react(wsA, map[string]interface{}{"kind": "direct", "messageID": directID, "emoji": "ok"})
		ev := wsA.wait(t, "error")
		ctx := ev["context"].(map[string]interface{})
		assert.Equal(t, "react", ctx["action"])
		assert.Equal(t, "direct", ctx["kind"])
		assert.EqualValues(t, directID, ctx["messageID"])
		assert.EqualValues(t, 400, ctx["status"])
		assert.Empty(t, reactionSummaries(history(ca)))
	})

	t.Run("1:1 mensaje ajeno (no participante) -> 404 por REST y error 404 por WS", func(t *testing.T) {
		code, _ := cc.do("PUT", fmt.Sprintf("/api/v1/chat/message/%d/reaction", directID), map[string]string{"emoji": "👍"})
		assert.Equal(t, 404, code)
		react(wsC, map[string]interface{}{"kind": "direct", "messageID": directID, "emoji": "👍"})
		ev := wsC.wait(t, "error")
		assert.EqualValues(t, 404, ev["context"].(map[string]interface{})["status"])
		code, _ = cc.do("GET", fmt.Sprintf("/api/v1/chat/message/%d/reactions", directID), nil)
		assert.Equal(t, 404, code)
		code, _ = ca.do("PUT", fmt.Sprintf("/api/v1/chat/message/%d/reaction", directID+900000), map[string]string{"emoji": "👍"})
		assert.Equal(t, 404, code)
	})

	t.Run("1:1 REST PUT/GET/DELETE y difusión en vivo", func(t *testing.T) {
		path := fmt.Sprintf("/api/v1/chat/message/%d/reaction", directID)
		code, body := ca.do("PUT", path, map[string]string{"emoji": "😂"})
		require.Equal(t, 200, code, body)
		assert.Equal(t, true, body["changed"])
		ev := wsB.wait(t, "reaction")["payload"].(map[string]interface{})
		assert.Equal(t, "😂", ev["emoji"])
		assert.Equal(t, text, ev["preview"])
		wsA.wait(t, "reaction") // el actor también lo recibe por su WS

		// bad bodies -> 400
		code, _ = ca.do("PUT", path, map[string]string{"emoji": "ok"})
		assert.Equal(t, 400, code)
		code, _ = ca.do("PUT", path, map[string]string{})
		assert.Equal(t, 400, code)

		// quien reaccionó: cualquier participante puede leerlo
		for _, c := range []*e2eClient{ca, cb} {
			code, list := c.do("GET", fmt.Sprintf("/api/v1/chat/message/%d/reactions", directID), nil)
			require.Equal(t, 200, code, list)
			reactions := list["reactions"].([]interface{})
			require.Len(t, reactions, 1)
			r := reactions[0].(map[string]interface{})
			assert.Equal(t, "😂", r["emoji"])
			users := r["users"].([]interface{})
			require.Len(t, users, 1)
			u := users[0].(map[string]interface{})
			assert.Equal(t, alice.Telephon, u["telephon"])
			assert.Equal(t, alice.Username, u["username"])
			assert.Contains(t, u, "avatarUrl")
		}

		code, body = ca.do("DELETE", path, nil)
		require.Equal(t, 200, code, body)
		ev = wsB.wait(t, "reaction")["payload"].(map[string]interface{})
		assert.Equal(t, "", ev["emoji"])
		wsA.wait(t, "reaction")
		code, body = ca.do("DELETE", path, nil)
		require.Equal(t, 200, code)
		assert.Equal(t, false, body["changed"], "quitar sin reacción es idempotente")
		code, list := ca.do("GET", fmt.Sprintf("/api/v1/chat/message/%d/reactions", directID), nil)
		require.Equal(t, 200, code)
		assert.Empty(t, list["reactions"])
	})

	// ── Grupo ──────────────────────────────────────────────────────────────
	groupText := fmt.Sprintf("hola grupo %d", suffix)
	require.NoError(t, rawB.WriteJSON(map[string]interface{}{"type": "group_chat", "payload": map[string]interface{}{"groupID": groupID, "message": groupText}}))
	gm := wsB.wait(t, "group_chat")
	groupMsgID := int(gm["payload"].(map[string]interface{})["MessageID"].(float64))
	wsA.wait(t, "group_chat")

	t.Run("grupo: miembros reciben el evento y el no miembro recibe 403", func(t *testing.T) {
		react(wsA, map[string]interface{}{"kind": "group", "groupID": groupID, "messageID": groupMsgID, "emoji": "🙏"})
		for name, ws := range map[string]*evStream{"bob": wsB, "alice": wsA} {
			ev := ws.wait(t, "reaction")["payload"].(map[string]interface{})
			assert.Equal(t, "group", ev["kind"], name)
			assert.EqualValues(t, groupID, ev["groupID"], name)
			assert.EqualValues(t, groupMsgID, ev["messageID"], name)
			assert.Equal(t, alice.Telephon, ev["telephon"], name)
			assert.Equal(t, "🙏", ev["emoji"], name)
			assert.Equal(t, bob.Telephon, ev["authorTelephon"], name)
			assert.Equal(t, groupText, ev["preview"], name)
		}
		wsC.none(t, "reaction", 300*time.Millisecond)

		path := fmt.Sprintf("/api/v1/group/%d/message/%d/reaction", groupID, groupMsgID)
		code, _ := cc.do("PUT", path, map[string]string{"emoji": "👍"})
		assert.Equal(t, 403, code)
		code, _ = cc.do("GET", fmt.Sprintf("/api/v1/group/%d/message/%d/reactions", groupID, groupMsgID), nil)
		assert.Equal(t, 403, code)
		react(wsC, map[string]interface{}{"kind": "group", "groupID": groupID, "messageID": groupMsgID, "emoji": "👍"})
		ev := wsC.wait(t, "error")
		assert.EqualValues(t, 403, ev["context"].(map[string]interface{})["status"])
	})

	t.Run("grupo: history con Mine por espectador y REST GET/DELETE", func(t *testing.T) {
		find := func(c *e2eClient) map[string]interface{} {
			code, page := c.do("GET", fmt.Sprintf("/api/v1/group/%d/message?limit=100", groupID), nil)
			require.Equal(t, 200, code, page)
			for _, m := range page["messages"].([]interface{}) {
				mm := m.(map[string]interface{})
				if int(mm["MessageID"].(float64)) == groupMsgID {
					return mm
				}
			}
			t.Fatalf("mensaje de grupo %d no está en la historia", groupMsgID)
			return nil
		}
		ra := reactionSummaries(find(ca))
		require.Len(t, ra, 1)
		assert.Equal(t, "🙏", ra[0]["Emoji"])
		assert.Equal(t, true, ra[0]["Mine"])
		rb := reactionSummaries(find(cb))
		require.Len(t, rb, 1)
		assert.Equal(t, false, rb[0]["Mine"])

		// Bob también reacciona por REST: cuenta 2 con el mismo emoji
		path := fmt.Sprintf("/api/v1/group/%d/message/%d/reaction", groupID, groupMsgID)
		code, body := cb.do("PUT", path, map[string]string{"emoji": "🙏"})
		require.Equal(t, 200, code, body)
		ev := wsA.wait(t, "reaction")["payload"].(map[string]interface{})
		assert.Equal(t, bob.Telephon, ev["telephon"])
		code, list := cb.do("GET", fmt.Sprintf("/api/v1/group/%d/message/%d/reactions", groupID, groupMsgID), nil)
		require.Equal(t, 200, code, list)
		reactions := list["reactions"].([]interface{})
		require.Len(t, reactions, 1)
		assert.Len(t, reactions[0].(map[string]interface{})["users"], 2)

		code, _ = cb.do("DELETE", path, nil)
		assert.Equal(t, 200, code)
		code, _ = ca.do("DELETE", path, nil)
		assert.Equal(t, 200, code)
		assert.Empty(t, reactionSummaries(find(ca)))
	})

	t.Run("grupo: mensaje de sistema o inexistente -> 404", func(t *testing.T) {
		code, page := ca.do("GET", fmt.Sprintf("/api/v1/group/%d/message?limit=100", groupID), nil)
		require.Equal(t, 200, code)
		systemID := 0
		for _, m := range page["messages"].([]interface{}) {
			mm := m.(map[string]interface{})
			if mm["Kind"] == models.GroupMessageKindSystem {
				systemID = int(mm["MessageID"].(float64))
				break
			}
		}
		if systemID != 0 {
			code, _ = ca.do("PUT", fmt.Sprintf("/api/v1/group/%d/message/%d/reaction", groupID, systemID), map[string]string{"emoji": "👍"})
			assert.Equal(t, 404, code, "los mensajes de sistema no admiten reacciones")
		}
		code, _ = ca.do("PUT", fmt.Sprintf("/api/v1/group/%d/message/%d/reaction", groupID, groupMsgID+900000), map[string]string{"emoji": "👍"})
		assert.Equal(t, 404, code)
	})
}
