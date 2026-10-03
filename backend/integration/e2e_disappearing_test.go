//go:build e2e

// Mensajes temporales (DE2) end-to-end contra el stack real: ajuste 1:1 y de
// grupo, no-op transaccional, sellado de ExpiresAt, permisos, DisappearSeconds
// en listados y exclusión de los mensajes de sistema en la búsqueda.
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
	"gorm.io/gorm"
)

// deResults extrae `results` de una respuesta de búsqueda con aserciones
// comprobadas (no entra en pánico si cambia la forma de la respuesta).
func deResults(t *testing.T, out map[string]interface{}) []map[string]interface{} {
	t.Helper()
	raw, ok := out["results"].([]interface{})
	require.True(t, ok, "la respuesta debe traer results[]: %v", out)
	res := make([]map[string]interface{}, 0, len(raw))
	for _, r := range raw {
		m, ok := r.(map[string]interface{})
		require.True(t, ok, "resultado inválido: %v", r)
		res = append(res, m)
	}
	return res
}

// deGlobalChat devuelve el chat de la búsqueda global con ese kind/key (o nil).
func deGlobalChat(t *testing.T, out map[string]interface{}, kind, key string) map[string]interface{} {
	t.Helper()
	chats, ok := out["chats"].([]interface{})
	require.True(t, ok, "la respuesta debe traer chats[]: %v", out)
	for _, c := range chats {
		m, ok := c.(map[string]interface{})
		require.True(t, ok, "chat inválido: %v", c)
		if m["kind"] == kind && m["key"] == key {
			return m
		}
	}
	return nil
}

// deHasID indica si algún elemento (objeto con la clave idKey) lleva ese id.
func deHasID(t *testing.T, items []interface{}, idKey string, id float64) bool {
	t.Helper()
	for _, it := range items {
		m, ok := it.(map[string]interface{})
		require.True(t, ok, "elemento inválido: %v", it)
		if m[idKey] == id {
			return true
		}
	}
	return false
}

func TestE2EDisappearingMessages(t *testing.T) {
	base := os.Getenv("E2E_BASE_URL")
	require.NotEmpty(t, base, "E2E_BASE_URL requerido")
	db, err := database.Conection()
	require.NoError(t, err)

	suffix := time.Now().UnixNano() % 1000000
	hash, err := utils.Hash("Passw0rd!")
	require.NoError(t, err)
	mk := func(name string, n int) models.UserDataBase {
		u := models.UserDataBase{User: models.User{
			Username: fmt.Sprintf("de%s%d", name, suffix),
			Gmail:    fmt.Sprintf("de%s%d@gmail.com", name, suffix),
			Telephon: fmt.Sprintf("+58%d%07d", n, suffix),
		}, Password: hash, Activo: true}
		require.NoError(t, db.Create(&u).Error)
		return u
	}
	ana, luis := mk("ana", 1), mk("luis", 2)
	// La suite e2e completa ya consume los 20 logins/min del limitador (ventana
	// fija por IP, que arranca en el primer login). Este test corre primero y usa
	// dos logins, así que al terminar espera a que expire esa ventana para no
	// dejar sin cupo a los tests siguientes.
	loginWindowStart := time.Now()
	t.Cleanup(func() {
		if wait := time.Minute + 2*time.Second - time.Since(loginWindowStart); wait > 0 {
			time.Sleep(wait)
		}
	})
	ca, cl := e2eLogin(t, base, ana), e2eLogin(t, base, luis)

	code, body := ca.do("POST", "/api/v1/contact", map[string]string{"number": luis.Telephon, "contact_name": "Luis"})
	require.Equal(t, 201, code, body)

	sendDirect := func(c *e2eClient, to, text string) map[string]interface{} {
		code, out := c.do("POST", "/api/v1/chat", map[string]string{"receptor": to, "message": text})
		require.Equal(t, 200, code, out)
		return out["message"].(map[string]interface{})
	}
	history := func(c *e2eClient, peer string) []map[string]interface{} {
		resp := c.raw("GET", "/api/v1/chat/"+peer)
		require.Equal(t, 200, resp.status, string(resp.body))
		var msgs []map[string]interface{}
		require.NoError(t, json.Unmarshal(resp.body, &msgs))
		return msgs
	}
	path := "/api/v1/chat/" + luis.Telephon + "/disappearing"

	// ── (a) 1:1 ────────────────────────────────────────────────────────────
	oldMsg := sendDirect(ca, luis.Telephon, fmt.Sprintf("antes del timer %d", suffix))
	assert.Nil(t, oldMsg["ExpiresAt"], "sin timer no hay ExpiresAt")

	t.Run("1:1 valor inválido 400 y contacto inexistente 404", func(t *testing.T) {
		code, out := ca.do("PUT", path, map[string]int{"seconds": 3600})
		assert.Equal(t, 400, code, out)
		code, out = ca.do("PUT", "/api/v1/chat/+5899999999999/disappearing", map[string]int{"seconds": 86400})
		assert.Equal(t, 404, code, out)
		code, out = ca.do("PUT", path, map[string]string{})
		assert.Equal(t, 400, code, out)
	})

	var sysID float64
	t.Run("1:1 set 86400: 200 con systemMessage; mismo valor no-op", func(t *testing.T) {
		code, out := ca.do("PUT", path, map[string]int{"seconds": 86400})
		require.Equal(t, 200, code, out)
		assert.Equal(t, "direct", out["kind"])
		assert.Equal(t, luis.Telephon, out["key"])
		assert.EqualValues(t, 86400, out["seconds"])
		assert.Equal(t, ana.Telephon, out["byTelephon"])
		sm, ok := out["systemMessage"].(map[string]interface{})
		require.True(t, ok, "debe traer systemMessage: %v", out)
		assert.Equal(t, "system", sm["Kind"])
		assert.Equal(t, models.SystemEventDisappearingChanged, sm["SystemEvent"])
		assert.Equal(t, "86400", sm["Message"])
		assert.Nil(t, sm["ExpiresAt"], "los mensajes de sistema no expiran")
		sysID = sm["MessageID"].(float64)

		code, out = ca.do("PUT", path, map[string]int{"seconds": 86400})
		require.Equal(t, 200, code, out)
		assert.Nil(t, out["systemMessage"], "sin cambio no hay mensaje de sistema")

		var n int64
		require.NoError(t, db.Model(&models.Message{}).
			Where("id_user = ? AND id_receptor = ? AND kind = ?", ana.ID, luis.ID, models.MessageKindSystem).
			Count(&n).Error)
		assert.EqualValues(t, 1, n, "el no-op no inserta otro mensaje de sistema")
	})

	t.Run("1:1 GET settings para ambos participantes", func(t *testing.T) {
		code, out := ca.do("GET", "/api/v1/chat/"+luis.Telephon+"/settings", nil)
		require.Equal(t, 200, code, out)
		assert.EqualValues(t, 86400, out["disappearSeconds"])
		code, out = cl.do("GET", "/api/v1/chat/"+ana.Telephon+"/settings", nil)
		require.Equal(t, 200, code, out)
		assert.EqualValues(t, 86400, out["disappearSeconds"], "ambas direcciones comparten el ajuste")
	})

	t.Run("1:1 mensaje nuevo lleva ExpiresAt ~ now+24h; el viejo no", func(t *testing.T) {
		newMsg := sendDirect(cl, ana.Telephon, fmt.Sprintf("despues del timer %d", suffix))
		raw, ok := newMsg["ExpiresAt"].(string)
		require.True(t, ok, "ExpiresAt presente: %v", newMsg)
		exp, err := time.Parse(time.RFC3339Nano, raw)
		require.NoError(t, err)
		assert.WithinDuration(t, time.Now().Add(24*time.Hour), exp, 2*time.Minute)

		for _, m := range history(ca, luis.Telephon) {
			switch m["MessageID"] {
			case oldMsg["MessageID"]:
				assert.Nil(t, m["ExpiresAt"], "el mensaje previo no se toca")
			case sysID:
				assert.Equal(t, "system", m["Kind"])
				assert.Nil(t, m["ExpiresAt"])
			}
		}
	})

	t.Run("chats list expone DisappearSeconds", func(t *testing.T) {
		resp := ca.raw("GET", "/api/v1/chats")
		require.Equal(t, 200, resp.status, string(resp.body))
		var chats []map[string]interface{}
		require.NoError(t, json.Unmarshal(resp.body, &chats))
		found := false
		for _, c := range chats {
			if c["ContactTelephon"] == luis.Telephon {
				found = true
				assert.EqualValues(t, 86400, c["DisappearSeconds"])
			}
		}
		assert.True(t, found)
	})

	t.Run("el mensaje de sistema 1:1 no se busca, edita ni borra", func(t *testing.T) {
		// Control positivo: un mensaje normal con el mismo texto SÍ se encuentra.
		ctl := sendDirect(ca, luis.Telephon, fmt.Sprintf("control86400 %d", suffix))
		code, out := ca.do("GET", "/api/v1/chat/"+luis.Telephon+"/search?q=86400", nil)
		require.Equal(t, 200, code, out)
		res := deResults(t, out)
		require.Len(t, res, 1, "solo el mensaje normal, no el de sistema: %v", res)
		assert.Equal(t, ctl["MessageID"], res[0]["messageID"], "búsqueda por chat")

		code, out = ca.do("GET", "/api/v1/search?q=86400", nil)
		require.Equal(t, 200, code, out)
		chat := deGlobalChat(t, out, "direct", luis.Telephon)
		require.NotNil(t, chat, "el chat con el mensaje normal aparece: %v", out)
		assert.EqualValues(t, 1, chat["total"], "búsqueda global: solo el mensaje normal")

		code, out = ca.do("PUT", "/api/v1/chat/edit", map[string]interface{}{"messageID": sysID, "receptor": luis.Telephon, "message": "editado"})
		assert.NotEqual(t, 200, code, "editar un mensaje de sistema debe fallar: %v", out)
		code, out = ca.do("DELETE", fmt.Sprintf("/api/v1/message/%d/me", int(sysID)), nil)
		assert.NotEqual(t, 200, code, "borrar para mí un mensaje de sistema debe fallar: %v", out)
	})

	t.Run("1:1 apagar (0) genera otro mensaje de sistema", func(t *testing.T) {
		code, out := cl.do("PUT", "/api/v1/chat/"+ana.Telephon+"/disappearing", map[string]int{"seconds": 0})
		require.Equal(t, 200, code, out)
		sm, ok := out["systemMessage"].(map[string]interface{})
		require.True(t, ok, out)
		assert.Equal(t, "0", sm["Message"])
		after := sendDirect(ca, luis.Telephon, fmt.Sprintf("apagado %d", suffix))
		assert.Nil(t, after["ExpiresAt"])
	})

	// ── (b) grupo ──────────────────────────────────────────────────────────
	code, body = ca.do("POST", "/api/v1/group", map[string]interface{}{
		"name":    "Temporales DE2",
		"members": []string{luis.Telephon},
	})
	require.Equal(t, 201, code, body)
	groupID := int(body["group"].(map[string]interface{})["ID"].(float64))
	gPath := fmt.Sprintf("/api/v1/group/%d/disappearing", groupID)

	t.Run("grupo: miembro permitido con info abierta; inválido 400", func(t *testing.T) {
		code, out := cl.do("PUT", gPath, map[string]int{"seconds": 12345})
		assert.Equal(t, 400, code, out)
		code, out = cl.do("PUT", gPath, map[string]int{"seconds": 604800})
		require.Equal(t, 200, code, out)
		assert.Equal(t, "group", out["kind"])
		assert.EqualValues(t, groupID, out["key"])
		assert.NotNil(t, out["systemMessage"])
	})

	t.Run("grupo: con OnlyAdminsCanEditInfo el miembro recibe 403 y el admin puede", func(t *testing.T) {
		code, out := ca.do("PATCH", fmt.Sprintf("/api/v1/group/%d/settings", groupID), map[string]bool{"onlyAdminsCanEditInfo": true})
		require.Equal(t, 200, code, out)

		code, out = cl.do("PUT", gPath, map[string]int{"seconds": 0})
		assert.Equal(t, 403, code, out)

		code, out = ca.do("PUT", gPath, map[string]int{"seconds": 86400})
		require.Equal(t, 200, code, out)
		sm, ok := out["systemMessage"].(map[string]interface{})
		require.True(t, ok, out)
		assert.Equal(t, models.SystemEventDisappearingChanged, sm["SystemEvent"])
		assert.Equal(t, "86400", sm["Message"])

		// mismo valor: no-op
		code, out = ca.do("PUT", gPath, map[string]int{"seconds": 86400})
		require.Equal(t, 200, code, out)
		assert.Nil(t, out["systemMessage"])
	})

	t.Run("grupo: detalle y lista muestran DisappearSeconds; el mensaje nuevo expira", func(t *testing.T) {
		code, detail := ca.do("GET", fmt.Sprintf("/api/v1/group/%d", groupID), nil)
		require.Equal(t, 200, code, detail)
		assert.EqualValues(t, 86400, detail["DisappearSeconds"])
		events := 0
		for _, item := range detail["Messages"].([]interface{}) {
			if item.(map[string]interface{})["SystemEvent"] == models.SystemEventDisappearingChanged {
				events++
			}
		}
		assert.Equal(t, 2, events, "dos cambios reales (604800 y 86400)")

		code, list := ca.do("GET", "/api/v1/group", nil)
		require.Equal(t, 200, code, list)
		found := false
		for _, item := range list["groups"].([]interface{}) {
			g := item.(map[string]interface{})
			if int(g["ID"].(float64)) == groupID {
				found = true
				assert.EqualValues(t, 86400, g["DisappearSeconds"])
			}
		}
		assert.True(t, found)

		code, out := cl.do("POST", fmt.Sprintf("/api/v1/group/%d/message", groupID), map[string]string{"message": "hola temporal"})
		require.Equal(t, 201, code, out)
		msg := out["message"].(map[string]interface{})
		raw, ok := msg["ExpiresAt"].(string)
		require.True(t, ok, "ExpiresAt presente: %v", msg)
		exp, err := time.Parse(time.RFC3339Nano, raw)
		require.NoError(t, err)
		assert.WithinDuration(t, time.Now().Add(24*time.Hour), exp, 2*time.Minute)
	})

	t.Run("grupo: el mensaje de sistema no aparece en la búsqueda del grupo", func(t *testing.T) {
		code, out := cl.do("POST", fmt.Sprintf("/api/v1/group/%d/message", groupID), map[string]string{"message": fmt.Sprintf("control86400 %d", suffix)})
		require.Equal(t, 201, code, out)
		ctlID := out["message"].(map[string]interface{})["MessageID"]

		code, out = ca.do("GET", fmt.Sprintf("/api/v1/group/%d/message/search?q=86400", groupID), nil)
		require.Equal(t, 200, code, out)
		res := deResults(t, out)
		require.Len(t, res, 1, "solo el mensaje normal, no los de sistema: %v", res)
		assert.Equal(t, ctlID, res[0]["messageID"])

		code, out = ca.do("GET", "/api/v1/search?q=86400", nil)
		require.Equal(t, 200, code, out)
		chat := deGlobalChat(t, out, "group", fmt.Sprint(groupID))
		require.NotNil(t, chat, "el grupo con el mensaje normal aparece: %v", out)
		assert.EqualValues(t, 1, chat["total"])
	})

	// ── (c) DE3: los mensajes vencidos no se leen ni se tocan aunque el job
	// de expiración todavía no los haya borrado ──────────────────────────────
	// expire fuerza expires_at al pasado con el reloj de la BD.
	expire := func(model interface{}, id float64) {
		require.NoError(t, db.Model(model).Where("id = ?", id).
			Update("expires_at", gorm.Expr("now() - interval '1 minute'")).Error)
	}
	tag := fmt.Sprintf("%d", suffix)

	t.Run("1:1 mensaje vencido: no se lee, busca, edita, borra, reacciona ni se responde", func(t *testing.T) {
		live := sendDirect(ca, luis.Telephon, "vigente"+tag)
		gone := sendDirect(ca, luis.Telephon, "caducado"+tag)
		liveID, goneID := live["MessageID"].(float64), gone["MessageID"].(float64)
		peer := luis.Telephon
		searchGone := func() (int, int) {
			code, out := ca.do("GET", "/api/v1/chat/"+peer+"/search?q=caducado"+tag, nil)
			require.Equal(t, 200, code, out)
			direct := len(deResults(t, out))
			code, out = ca.do("GET", "/api/v1/search?q=caducado"+tag, nil)
			require.Equal(t, 200, code, out)
			global := 0
			if chat := deGlobalChat(t, out, "direct", peer); chat != nil {
				global = int(chat["total"].(float64))
			}
			return direct, global
		}

		// Antes de vencer todo funciona (control positivo).
		d, g := searchGone()
		assert.Equal(t, 1, d, "antes de vencer se busca por chat")
		assert.Equal(t, 1, g, "antes de vencer se busca global")
		code, out := ca.do("GET", fmt.Sprintf("/api/v1/chat/%s?around=%d", peer, int(goneID)), nil)
		require.Equal(t, 200, code, out)

		expire(&models.Message{}, goneID)

		// Historial, página, around, after.
		var all []interface{}
		resp := ca.raw("GET", "/api/v1/chat/"+peer)
		require.Equal(t, 200, resp.status)
		require.NoError(t, json.Unmarshal(resp.body, &all))
		assert.True(t, deHasID(t, all, "MessageID", liveID), "el vigente sigue en el historial")
		assert.False(t, deHasID(t, all, "MessageID", goneID), "historial")

		resp = ca.raw("GET", fmt.Sprintf("/api/v1/chat/%s?before=%d&limit=50", peer, int(liveID)+1))
		require.Equal(t, 200, resp.status)
		all = nil
		require.NoError(t, json.Unmarshal(resp.body, &all))
		assert.False(t, deHasID(t, all, "MessageID", goneID), "página con cursor")

		code, out = ca.do("GET", fmt.Sprintf("/api/v1/chat/%s?around=%d", peer, int(goneID)), nil)
		assert.Equal(t, 404, code, "around de un vencido: 404, no ventana vacía: %v", out)
		resp = ca.raw("GET", fmt.Sprintf("/api/v1/chat/%s?around=%d", peer, int(liveID)))
		require.Equal(t, 200, resp.status)
		all = nil
		require.NoError(t, json.Unmarshal(resp.body, &all))
		assert.True(t, deHasID(t, all, "MessageID", liveID))
		assert.False(t, deHasID(t, all, "MessageID", goneID), "around del vigente no arrastra el vencido")

		resp = ca.raw("GET", fmt.Sprintf("/api/v1/chat/%s?after=%d", peer, int(oldMsg["MessageID"].(float64))))
		require.Equal(t, 200, resp.status)
		all = nil
		require.NoError(t, json.Unmarshal(resp.body, &all))
		assert.True(t, deHasID(t, all, "MessageID", liveID))
		assert.False(t, deHasID(t, all, "MessageID", goneID), "after")

		// Lista de chats: el último mensaje es el vigente.
		resp = ca.raw("GET", "/api/v1/chats")
		require.Equal(t, 200, resp.status)
		var chats []map[string]interface{}
		require.NoError(t, json.Unmarshal(resp.body, &chats))
		seen := false
		for _, c := range chats {
			if c["ContactTelephon"] != peer {
				continue
			}
			seen = true
			msgs, ok := c["Messages"].([]interface{})
			require.True(t, ok, "Messages[] en el chat: %v", c)
			require.NotEmpty(t, msgs)
			assert.False(t, deHasID(t, msgs, "MessageID", goneID), "lista de chats")
			assert.Equal(t, liveID, msgs[len(msgs)-1].(map[string]interface{})["MessageID"], "último mensaje = el vigente")
		}
		assert.True(t, seen, "el chat aparece en la lista")

		// Búsqueda por chat y global.
		d, g = searchGone()
		assert.Equal(t, 0, d, "búsqueda por chat")
		assert.Equal(t, 0, g, "búsqueda global")
		code, out = ca.do("GET", "/api/v1/chat/"+peer+"/search?q=vigente"+tag, nil)
		require.Equal(t, 200, code, out)
		assert.Len(t, deResults(t, out), 1, "control positivo: el vigente sí se busca")

		// Operaciones sobre el vencido.
		code, out = ca.do("PUT", "/api/v1/chat/edit", map[string]interface{}{"messageID": goneID, "receptor": peer, "message": "editado"})
		assert.NotEqual(t, 200, code, "editar un vencido: %v", out)
		code, out = ca.do("DELETE", fmt.Sprintf("/api/v1/message/%d/me", int(goneID)), nil)
		assert.NotEqual(t, 200, code, "borrar para mí un vencido: %v", out)
		code, out = cl.do("PUT", fmt.Sprintf("/api/v1/chat/message/%d/reaction", int(goneID)), map[string]string{"emoji": "👍"})
		assert.Equal(t, 404, code, "reaccionar a un vencido: %v", out)
		code, out = ca.do("POST", "/api/v1/chat", map[string]interface{}{"receptor": peer, "message": "respuesta", "replyToMessageID": goneID})
		assert.GreaterOrEqual(t, code, 400, "responder a un vencido: %v", out)

		var row models.Message
		require.NoError(t, db.First(&row, uint(goneID)).Error)
		assert.Equal(t, "caducado"+tag, row.Message, "el texto no cambió")
		assert.False(t, row.Edited)
		assert.False(t, row.DeletedBySender || row.DeletedByReceiver)
		var replies int64
		require.NoError(t, db.Model(&models.Message{}).Where("reply_to_message_id = ?", uint(goneID)).Count(&replies).Error)
		assert.Zero(t, replies, "no se creó ninguna respuesta")

		// El vigente conserva sus operaciones.
		code, out = ca.do("PUT", "/api/v1/chat/edit", map[string]interface{}{"messageID": liveID, "receptor": peer, "message": "vigente editado " + tag})
		assert.Equal(t, 200, code, "control positivo de edición: %v", out)
	})

	t.Run("grupo mensaje vencido: no se lee, busca, edita, borra, reacciona, responde ni consulta acuses", func(t *testing.T) {
		post := func(c *e2eClient, text string, extra map[string]interface{}) (int, map[string]interface{}) {
			body := map[string]interface{}{"message": text}
			for k, v := range extra {
				body[k] = v
			}
			return c.do("POST", fmt.Sprintf("/api/v1/group/%d/message", groupID), body)
		}
		code, out := post(ca, "gvigente"+tag, nil)
		require.Equal(t, 201, code, out)
		liveID := out["message"].(map[string]interface{})["MessageID"].(float64)
		code, out = post(ca, "gcaducado"+tag, nil)
		require.Equal(t, 201, code, out)
		goneID := out["message"].(map[string]interface{})["MessageID"].(float64)
		gBase := fmt.Sprintf("/api/v1/group/%d", groupID)
		msgsOf := func(path string) []interface{} {
			code, out := ca.do("GET", path, nil)
			require.Equal(t, 200, code, out)
			msgs, ok := out["messages"].([]interface{})
			require.True(t, ok, "messages[] en %s: %v", path, out)
			return msgs
		}
		searchGone := func() (int, int) {
			code, out := ca.do("GET", gBase+"/message/search?q=gcaducado"+tag, nil)
			require.Equal(t, 200, code, out)
			direct := len(deResults(t, out))
			code, out = ca.do("GET", "/api/v1/search?q=gcaducado"+tag, nil)
			require.Equal(t, 200, code, out)
			global := 0
			if chat := deGlobalChat(t, out, "group", fmt.Sprint(groupID)); chat != nil {
				global = int(chat["total"].(float64))
			}
			return direct, global
		}

		// Control positivo antes de vencer: acuses y búsqueda funcionan.
		code, out = ca.do("GET", fmt.Sprintf("%s/message/%d/receipts", gBase, int(goneID)), nil)
		require.Equal(t, 200, code, out)
		d, g := searchGone()
		assert.Equal(t, 1, d)
		assert.Equal(t, 1, g)
		code, out = ca.do("GET", fmt.Sprintf("%s/message?around=%d", gBase, int(goneID)), nil)
		require.Equal(t, 200, code, out)

		expire(&models.GroupMessage{}, goneID)

		assert.True(t, deHasID(t, msgsOf(gBase+"/message"), "MessageID", liveID), "el vigente sigue en la página")
		assert.False(t, deHasID(t, msgsOf(gBase+"/message"), "MessageID", goneID), "página")
		assert.False(t, deHasID(t, msgsOf(fmt.Sprintf("%s/message?before=%d", gBase, int(liveID)+1)), "MessageID", goneID), "página con cursor")
		code, out = ca.do("GET", fmt.Sprintf("%s/message?around=%d", gBase, int(goneID)), nil)
		assert.Equal(t, 404, code, "around de un vencido: 404: %v", out)
		around := msgsOf(fmt.Sprintf("%s/message?around=%d", gBase, int(liveID)))
		assert.True(t, deHasID(t, around, "MessageID", liveID))
		assert.False(t, deHasID(t, around, "MessageID", goneID), "around del vigente")
		after := msgsOf(fmt.Sprintf("%s/message?after=%d", gBase, int(liveID)-1))
		assert.True(t, deHasID(t, after, "MessageID", liveID))
		assert.False(t, deHasID(t, after, "MessageID", goneID), "after")

		code, detail := ca.do("GET", gBase, nil)
		require.Equal(t, 200, code, detail)
		items, ok := detail["Messages"].([]interface{})
		require.True(t, ok, "detalle con Messages[]: %v", detail)
		assert.True(t, deHasID(t, items, "MessageID", liveID))
		assert.False(t, deHasID(t, items, "MessageID", goneID), "detalle del grupo")

		d, g = searchGone()
		assert.Equal(t, 0, d, "búsqueda del grupo")
		assert.Equal(t, 0, g, "búsqueda global")
		code, out = ca.do("GET", gBase+"/message/search?q=gvigente"+tag, nil)
		require.Equal(t, 200, code, out)
		assert.Len(t, deResults(t, out), 1, "control positivo: el vigente sí se busca")

		code, out = ca.do("PUT", gBase+"/message", map[string]interface{}{"messageID": goneID, "message": "editado"})
		assert.NotEqual(t, 200, code, "editar un vencido: %v", out)
		code, out = ca.do("DELETE", gBase+"/message", map[string]interface{}{"messageID": goneID})
		assert.NotEqual(t, 200, code, "borrar un vencido: %v", out)
		code, out = cl.do("PUT", fmt.Sprintf("%s/message/%d/reaction", gBase, int(goneID)), map[string]string{"emoji": "👍"})
		assert.Equal(t, 404, code, "reaccionar a un vencido: %v", out)
		code, out = ca.do("GET", fmt.Sprintf("%s/message/%d/receipts", gBase, int(goneID)), nil)
		assert.Equal(t, 404, code, "acuses de un vencido: %v", out)
		code, out = post(cl, "respuesta", map[string]interface{}{"replyToMessageID": goneID})
		assert.GreaterOrEqual(t, code, 400, "responder a un vencido: %v", out)

		var row models.GroupMessage
		require.NoError(t, db.First(&row, uint(goneID)).Error)
		assert.Equal(t, "gcaducado"+tag, row.Message, "el texto no cambió")
		assert.False(t, row.Edited)
		var replies int64
		require.NoError(t, db.Model(&models.GroupMessage{}).Where("reply_to_message_id = ?", uint(goneID)).Count(&replies).Error)
		assert.Zero(t, replies, "no se creó ninguna respuesta")

		// El vigente conserva sus operaciones.
		code, out = ca.do("PUT", gBase+"/message", map[string]interface{}{"messageID": liveID, "message": "gvigente editado " + tag})
		assert.Equal(t, 200, code, "control positivo de edición: %v", out)
		code, out = ca.do("GET", fmt.Sprintf("%s/message/%d/receipts", gBase, int(liveID)), nil)
		assert.Equal(t, 200, code, "control positivo de acuses: %v", out)
	})
}
