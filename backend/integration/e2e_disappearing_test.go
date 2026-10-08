//go:build e2e

// Mensajes temporales (DE2) end-to-end contra el stack real: ajuste 1:1 y de
// grupo, no-op transaccional, sellado de ExpiresAt, permisos, DisappearSeconds
// en listados y exclusión de los mensajes de sistema en la búsqueda.
//
//	E2E_BASE_URL=http://127.0.0.1:8080 go test -tags e2e ./backend/integration/
package integration

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"gorm/backend/database"
	"gorm/backend/models"
	"gorm/backend/repos"
	"gorm/backend/services"
	"gorm/backend/utils"
	"os"
	"sync"
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

	code, body := ca.do("POST", "/api/v1/contact", map[string]string{"telephon": luis.Telephon, "contactName": "Luis"})
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
	assert.Nil(t, oldMsg["expiresAt"], "sin timer no hay ExpiresAt")

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
		assert.Equal(t, "system", sm["kind"])
		assert.Equal(t, models.SystemEventDisappearingChanged, sm["systemEvent"])
		assert.Equal(t, "86400", sm["message"])
		assert.Nil(t, sm["expiresAt"], "los mensajes de sistema no expiran")
		sysID = sm["messageID"].(float64)

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
		raw, ok := newMsg["expiresAt"].(string)
		require.True(t, ok, "ExpiresAt presente: %v", newMsg)
		exp, err := time.Parse(time.RFC3339Nano, raw)
		require.NoError(t, err)
		assert.WithinDuration(t, time.Now().Add(24*time.Hour), exp, 2*time.Minute)

		for _, m := range history(ca, luis.Telephon) {
			switch m["messageID"] {
			case oldMsg["messageID"]:
				assert.Nil(t, m["expiresAt"], "el mensaje previo no se toca")
			case sysID:
				assert.Equal(t, "system", m["kind"])
				assert.Nil(t, m["expiresAt"])
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
			if c["contactTelephon"] == luis.Telephon {
				found = true
				assert.EqualValues(t, 86400, c["disappearSeconds"])
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
		assert.Equal(t, ctl["messageID"], res[0]["messageID"], "búsqueda por chat")

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
		assert.Equal(t, "0", sm["message"])
		after := sendDirect(ca, luis.Telephon, fmt.Sprintf("apagado %d", suffix))
		assert.Nil(t, after["expiresAt"])
	})

	// ── (b) grupo ──────────────────────────────────────────────────────────
	code, body = ca.do("POST", "/api/v1/group", map[string]interface{}{
		"name":    "Temporales DE2",
		"members": []string{luis.Telephon},
	})
	require.Equal(t, 201, code, body)
	groupID := int(body["group"].(map[string]interface{})["id"].(float64))
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
		assert.Equal(t, models.SystemEventDisappearingChanged, sm["systemEvent"])
		assert.Equal(t, "86400", sm["message"])

		// mismo valor: no-op
		code, out = ca.do("PUT", gPath, map[string]int{"seconds": 86400})
		require.Equal(t, 200, code, out)
		assert.Nil(t, out["systemMessage"])
	})

	t.Run("grupo: detalle y lista muestran DisappearSeconds; el mensaje nuevo expira", func(t *testing.T) {
		code, detail := ca.do("GET", fmt.Sprintf("/api/v1/group/%d", groupID), nil)
		require.Equal(t, 200, code, detail)
		assert.EqualValues(t, 86400, detail["disappearSeconds"])
		events := 0
		for _, item := range detail["messages"].([]interface{}) {
			if item.(map[string]interface{})["systemEvent"] == models.SystemEventDisappearingChanged {
				events++
			}
		}
		assert.Equal(t, 2, events, "dos cambios reales (604800 y 86400)")

		code, list := ca.do("GET", "/api/v1/group", nil)
		require.Equal(t, 200, code, list)
		found := false
		for _, item := range list["groups"].([]interface{}) {
			g := item.(map[string]interface{})
			if int(g["id"].(float64)) == groupID {
				found = true
				assert.EqualValues(t, 86400, g["disappearSeconds"])
			}
		}
		assert.True(t, found)

		code, out := cl.do("POST", fmt.Sprintf("/api/v1/group/%d/message", groupID), map[string]string{"message": "hola temporal"})
		require.Equal(t, 201, code, out)
		msg := out["message"].(map[string]interface{})
		raw, ok := msg["expiresAt"].(string)
		require.True(t, ok, "ExpiresAt presente: %v", msg)
		exp, err := time.Parse(time.RFC3339Nano, raw)
		require.NoError(t, err)
		assert.WithinDuration(t, time.Now().Add(24*time.Hour), exp, 2*time.Minute)
	})

	t.Run("grupo: el mensaje de sistema no aparece en la búsqueda del grupo", func(t *testing.T) {
		code, out := cl.do("POST", fmt.Sprintf("/api/v1/group/%d/message", groupID), map[string]string{"message": fmt.Sprintf("control86400 %d", suffix)})
		require.Equal(t, 201, code, out)
		ctlID := out["message"].(map[string]interface{})["messageID"]

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
		liveID, goneID := live["messageID"].(float64), gone["messageID"].(float64)
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
		assert.True(t, deHasID(t, all, "messageID", liveID), "el vigente sigue en el historial")
		assert.False(t, deHasID(t, all, "messageID", goneID), "historial")

		resp = ca.raw("GET", fmt.Sprintf("/api/v1/chat/%s?before=%d&limit=50", peer, int(liveID)+1))
		require.Equal(t, 200, resp.status)
		all = nil
		require.NoError(t, json.Unmarshal(resp.body, &all))
		assert.False(t, deHasID(t, all, "messageID", goneID), "página con cursor")

		code, out = ca.do("GET", fmt.Sprintf("/api/v1/chat/%s?around=%d", peer, int(goneID)), nil)
		assert.Equal(t, 404, code, "around de un vencido: 404, no ventana vacía: %v", out)
		resp = ca.raw("GET", fmt.Sprintf("/api/v1/chat/%s?around=%d", peer, int(liveID)))
		require.Equal(t, 200, resp.status)
		all = nil
		require.NoError(t, json.Unmarshal(resp.body, &all))
		assert.True(t, deHasID(t, all, "messageID", liveID))
		assert.False(t, deHasID(t, all, "messageID", goneID), "around del vigente no arrastra el vencido")

		resp = ca.raw("GET", fmt.Sprintf("/api/v1/chat/%s?after=%d", peer, int(oldMsg["messageID"].(float64))))
		require.Equal(t, 200, resp.status)
		all = nil
		require.NoError(t, json.Unmarshal(resp.body, &all))
		assert.True(t, deHasID(t, all, "messageID", liveID))
		assert.False(t, deHasID(t, all, "messageID", goneID), "after")

		// Lista de chats: el último mensaje es el vigente.
		resp = ca.raw("GET", "/api/v1/chats")
		require.Equal(t, 200, resp.status)
		var chats []map[string]interface{}
		require.NoError(t, json.Unmarshal(resp.body, &chats))
		seen := false
		for _, c := range chats {
			if c["contactTelephon"] != peer {
				continue
			}
			seen = true
			msgs, ok := c["messages"].([]interface{})
			require.True(t, ok, "messages[] en el chat: %v", c)
			require.NotEmpty(t, msgs)
			assert.False(t, deHasID(t, msgs, "messageID", goneID), "lista de chats")
			assert.Equal(t, liveID, msgs[len(msgs)-1].(map[string]interface{})["messageID"], "último mensaje = el vigente")
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
		// Las rutas 1:1 mapean "no encontrado" a 404 (igual que reacciones).
		assert.Equal(t, 404, code, "editar un vencido: %v", out)
		code, out = ca.do("DELETE", fmt.Sprintf("/api/v1/message/%d/me", int(goneID)), nil)
		assert.Equal(t, 404, code, "borrar para mí un vencido: %v", out)
		code, out = cl.do("PUT", fmt.Sprintf("/api/v1/chat/message/%d/reaction", int(goneID)), map[string]string{"emoji": "👍"})
		assert.Equal(t, 404, code, "reaccionar a un vencido: %v", out)
		code, out = ca.do("POST", "/api/v1/chat", map[string]interface{}{"receptor": peer, "message": "respuesta", "replyToMessageID": goneID})
		assert.Equal(t, 404, code, "responder a un vencido: %v", out)

		// El job de expiración (DE4) puede haberlo borrado ya: también vale.
		var row models.Message
		if err := db.Unscoped().First(&row, uint(goneID)).Error; !errors.Is(err, gorm.ErrRecordNotFound) {
			require.NoError(t, err)
			assert.Equal(t, "caducado"+tag, row.Message, "el texto no cambió")
			assert.False(t, row.Edited)
			assert.False(t, row.DeletedBySender || row.DeletedByReceiver)
			assert.False(t, row.DeletedAt.Valid)
		}
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
		liveID := out["message"].(map[string]interface{})["messageID"].(float64)
		code, out = post(ca, "gcaducado"+tag, nil)
		require.Equal(t, 201, code, out)
		goneID := out["message"].(map[string]interface{})["messageID"].(float64)
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

		assert.True(t, deHasID(t, msgsOf(gBase+"/message"), "messageID", liveID), "el vigente sigue en la página")
		assert.False(t, deHasID(t, msgsOf(gBase+"/message"), "messageID", goneID), "página")
		assert.False(t, deHasID(t, msgsOf(fmt.Sprintf("%s/message?before=%d", gBase, int(liveID)+1)), "messageID", goneID), "página con cursor")
		code, out = ca.do("GET", fmt.Sprintf("%s/message?around=%d", gBase, int(goneID)), nil)
		assert.Equal(t, 404, code, "around de un vencido: 404: %v", out)
		around := msgsOf(fmt.Sprintf("%s/message?around=%d", gBase, int(liveID)))
		assert.True(t, deHasID(t, around, "messageID", liveID))
		assert.False(t, deHasID(t, around, "messageID", goneID), "around del vigente")
		after := msgsOf(fmt.Sprintf("%s/message?after=%d", gBase, int(liveID)-1))
		assert.True(t, deHasID(t, after, "messageID", liveID))
		assert.False(t, deHasID(t, after, "messageID", goneID), "after")

		code, detail := ca.do("GET", gBase, nil)
		require.Equal(t, 200, code, detail)
		items, ok := detail["messages"].([]interface{})
		require.True(t, ok, "detalle con Messages[]: %v", detail)
		assert.True(t, deHasID(t, items, "messageID", liveID))
		assert.False(t, deHasID(t, items, "messageID", goneID), "detalle del grupo")

		d, g = searchGone()
		assert.Equal(t, 0, d, "búsqueda del grupo")
		assert.Equal(t, 0, g, "búsqueda global")
		code, out = ca.do("GET", gBase+"/message/search?q=gvigente"+tag, nil)
		require.Equal(t, 200, code, out)
		assert.Len(t, deResults(t, out), 1, "control positivo: el vigente sí se busca")

		code, out = ca.do("PUT", gBase+"/message", map[string]interface{}{"messageID": goneID, "message": "editado"})
		assert.Equal(t, 400, code, "editar un vencido: %v", out)
		code, out = ca.do("DELETE", gBase+"/message", map[string]interface{}{"messageID": goneID})
		assert.Equal(t, 400, code, "borrar un vencido: %v", out)
		code, out = cl.do("PUT", fmt.Sprintf("%s/message/%d/reaction", gBase, int(goneID)), map[string]string{"emoji": "👍"})
		assert.Equal(t, 404, code, "reaccionar a un vencido: %v", out)
		code, out = ca.do("GET", fmt.Sprintf("%s/message/%d/receipts", gBase, int(goneID)), nil)
		assert.Equal(t, 404, code, "acuses de un vencido: %v", out)
		code, out = post(cl, "respuesta", map[string]interface{}{"replyToMessageID": goneID})
		assert.Equal(t, 400, code, "responder a un vencido: %v", out)

		var row models.GroupMessage
		if err := db.Unscoped().First(&row, uint(goneID)).Error; !errors.Is(err, gorm.ErrRecordNotFound) {
			require.NoError(t, err)
			assert.Equal(t, "gcaducado"+tag, row.Message, "el texto no cambió")
			assert.False(t, row.Edited)
			assert.False(t, row.DeletedAt.Valid)
		}
		var replies int64
		require.NoError(t, db.Model(&models.GroupMessage{}).Where("reply_to_message_id = ?", uint(goneID)).Count(&replies).Error)
		assert.Zero(t, replies, "no se creó ninguna respuesta")

		// El vigente conserva sus operaciones.
		code, out = ca.do("PUT", gBase+"/message", map[string]interface{}{"messageID": liveID, "message": "gvigente editado " + tag})
		assert.Equal(t, 200, code, "control positivo de edición: %v", out)
		code, out = ca.do("GET", fmt.Sprintf("%s/message/%d/receipts", gBase, int(liveID)), nil)
		assert.Equal(t, 200, code, "control positivo de acuses: %v", out)
	})

	// ── (d) DE4: el job de expiración borra físicamente ────────────────────
	t.Run("DE4 job de expiración: borrado físico, citas, reacciones y media_gc", func(t *testing.T) {
		deExpiryJob(t, db, ana, luis, uint(groupID), tag)
	})
}

// deOwnedQueueRepo es el repo real con la cola media_gc acotada a las keys del
// test: la pasada en proceso nunca ve (ni, por tanto, reintenta, reprograma o
// borra) filas de la cola que pertenecen a otros datos del stack.
type deOwnedQueueRepo struct {
	*repos.RepoExpiry
	owned map[string]bool
}

func (r *deOwnedQueueRepo) DueMediaGC(ctx context.Context, limit int) ([]models.MediaGC, error) {
	all, err := r.RepoExpiry.DueMediaGC(ctx, 100000)
	if err != nil {
		return nil, err
	}
	var out []models.MediaGC
	for _, row := range all {
		if r.owned[row.ObjectKey] && len(out) < limit {
			out = append(out, row)
		}
	}
	return out, nil
}

// deRemover borra (de mentira) solo los objetos sembrados por el test. Como el
// repo envuelto solo le entrega filas propias, un objeto ajeno sería un fallo
// del test: devuelve error para que se note.
type deRemover struct {
	store *services.ServiceMedia
	owned map[string]bool
	mu    sync.Mutex
	seen  []string
}

func (r *deRemover) ObjectKeyFromURL(url string) (string, bool) { return r.store.ObjectKeyFromURL(url) }

func (r *deRemover) RemoveObject(_ context.Context, key string) error {
	if !r.owned[key] {
		return errors.New("objeto ajeno al test e2e")
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.seen = append(r.seen, key)
	return nil
}

func (r *deRemover) removed() []string {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]string(nil), r.seen...)
}

type deEvent struct {
	to      string
	groupID uint
	payload struct {
		Kind       string          `json:"kind"`
		Key        json.RawMessage `json:"key"`
		MessageIDs []uint          `json:"messageIDs"`
	}
}

type deNotifier struct {
	mu     sync.Mutex
	events []deEvent
}

func (n *deNotifier) record(to string, groupID uint, msg []byte) {
	var env struct {
		Type    string `json:"type"`
		Payload json.RawMessage
	}
	ev := deEvent{to: to, groupID: groupID}
	if json.Unmarshal(msg, &env) == nil && env.Type == "messages_expired" {
		_ = json.Unmarshal(env.Payload, &ev.payload)
	}
	n.mu.Lock()
	n.events = append(n.events, ev)
	n.mu.Unlock()
}

func (n *deNotifier) SendTo(telephon string, msg []byte) { n.record(telephon, 0, msg) }
func (n *deNotifier) SendToGroup(groupID uint, sender string, msg []byte) {
	n.record(sender, groupID, msg)
}

type deNoMetrics struct{}

func (deNoMetrics) MessagesExpired(string, int) {}
func (deNoMetrics) MediaGCResult(string)        {}
func (deNoMetrics) SetMediaGCPending(int64)     {}

// deExpiryJob siembra mensajes vencidos (con adjunto, respuesta que copia su
// texto y reacción) y ejecuta el job EN PROCESO contra la BD del stack. El job
// real de la app también corre cada minuto: SKIP LOCKED evita que dos pasadas
// tomen la misma fila y aquí se comprueba el estado final, no quién borró.
func deExpiryJob(t *testing.T, db *gorm.DB, ana, luis models.UserDataBase, groupID uint, tag string) {
	bucket := os.Getenv("MINIO_BUCKET")
	if bucket == "" {
		bucket = "media"
	}
	store := services.NewServiceMedia(nil)
	goneKey := "images/e2e-de4/" + tag + "gone.jpg"
	sharedKey := "images/e2e-de4/" + tag + "shared.jpg"
	groupKey := "images/e2e-de4/" + tag + "group.jpg"
	urlOf := func(key string) string { return "/storage/" + bucket + "/" + key }
	past := time.Now().Add(-time.Hour)
	now := time.Now()

	gone := models.Message{IdUser: ana.ID, IdReceptor: luis.ID, Message: "de4 se va " + tag, Status: "enviado", Time: now,
		MediaUrl: urlOf(goneKey), MediaType: "image", ExpiresAt: &past}
	sharedGone := models.Message{IdUser: ana.ID, IdReceptor: luis.ID, Message: "de4 compartido vencido " + tag, Status: "enviado", Time: now,
		MediaUrl: urlOf(sharedKey), MediaType: "image", ExpiresAt: &past}
	// Reenvío vivo del mismo adjunto: el objeto no se puede borrar.
	sharedLive := models.Message{IdUser: luis.ID, IdReceptor: ana.ID, Message: "de4 compartido vivo " + tag, Status: "enviado", Time: now,
		MediaUrl: urlOf(sharedKey), MediaType: "image"}
	ggone := models.GroupMessage{GroupID: groupID, SenderID: ana.ID, Message: "de4 grupo se va " + tag, Time: now,
		MediaUrl: urlOf(groupKey), MediaType: "image", ExpiresAt: &past}
	var reply models.Message
	var greply models.GroupMessage

	// Todo en una transacción: el job real ve todas las filas o ninguna (si
	// borrara el original antes de insertar la respuesta, la cita sobreviviría).
	require.NoError(t, db.Transaction(func(tx *gorm.DB) error {
		for _, m := range []*models.Message{&gone, &sharedGone, &sharedLive} {
			if err := tx.Create(m).Error; err != nil {
				return err
			}
		}
		if err := tx.Create(&ggone).Error; err != nil {
			return err
		}
		quote, gquote := gone.Message, ggone.Message
		reply = models.Message{IdUser: luis.ID, IdReceptor: ana.ID, Message: "de4 respuesta " + tag, Status: "enviado", Time: now,
			ReplyToMessageID: &gone.ID, ReplyToMessage: &quote, ReplyToTelephon: &ana.Telephon}
		if err := tx.Create(&reply).Error; err != nil {
			return err
		}
		greply = models.GroupMessage{GroupID: groupID, SenderID: luis.ID, Message: "de4 respuesta grupo " + tag, Time: now,
			ReplyToMessageID: &ggone.ID, ReplyToMessage: &gquote, ReplyToTelephon: &ana.Telephon}
		if err := tx.Create(&greply).Error; err != nil {
			return err
		}
		for _, r := range []models.MessageReaction{
			{MessageKind: models.ReactionKindDirect, MessageID: gone.ID, UserID: luis.ID, Emoji: "👍"},
			{MessageKind: models.ReactionKindGroup, MessageID: ggone.ID, UserID: luis.ID, Emoji: "🔥"},
		} {
			if err := tx.Create(&r).Error; err != nil {
				return err
			}
		}
		return nil
	}))

	// Fila de cola AJENA al test, vencida para el reintento: la pasada en proceso
	// no debe tocarla (attempts, next_attempt_at y last_error quedan igual).
	foreignKey := "images/e2e-de4/" + tag + "foreign.jpg"
	require.NoError(t, db.Exec(`INSERT INTO media_gc (object_key, attempts, next_attempt_at, last_error, created_at, updated_at)
		VALUES (?, 3, now() - interval '1 minute', 'ajena', now(), now())`, foreignKey).Error)
	t.Cleanup(func() { db.Exec("DELETE FROM media_gc WHERE object_key = ?", foreignKey) })
	type gcSnap struct {
		Attempts      int
		NextAttemptAt time.Time
		LastError     string
	}
	foreignSnap := func() (gcSnap, bool) {
		var rows []gcSnap
		require.NoError(t, db.Raw("SELECT attempts, next_attempt_at, last_error FROM media_gc WHERE object_key = ?", foreignKey).Scan(&rows).Error)
		if len(rows) == 0 {
			return gcSnap{}, false
		}
		return rows[0], true
	}
	foreignBefore, _ := foreignSnap()

	// Respuesta huérfana: su objetivo ya no existe como fila (carrera con la
	// expiración). El barrido de cada pasada debe limpiarle la cita. La segunda
	// respuesta apunta a un objetivo soft-deleted, que sigue existiendo: no es
	// huérfana y conserva la cita.
	hardGone := models.Message{IdUser: ana.ID, IdReceptor: luis.ID, Message: "de4 objetivo huérfano " + tag, Status: "enviado", Time: now}
	softGone := models.Message{IdUser: ana.ID, IdReceptor: luis.ID, Message: "de4 objetivo soft " + tag, Status: "enviado", Time: now}
	require.NoError(t, db.Create(&hardGone).Error)
	require.NoError(t, db.Create(&softGone).Error)
	oq, sq := hardGone.Message, softGone.Message
	orphan := models.Message{IdUser: luis.ID, IdReceptor: ana.ID, Message: "de4 respuesta huérfana " + tag, Status: "enviado", Time: now,
		ReplyToMessageID: &hardGone.ID, ReplyToMessage: &oq, ReplyToTelephon: &ana.Telephon}
	softReply := models.Message{IdUser: luis.ID, IdReceptor: ana.ID, Message: "de4 respuesta a soft " + tag, Status: "enviado", Time: now,
		ReplyToMessageID: &softGone.ID, ReplyToMessage: &sq, ReplyToTelephon: &ana.Telephon}
	require.NoError(t, db.Create(&orphan).Error)
	require.NoError(t, db.Create(&softReply).Error)
	require.NoError(t, db.Unscoped().Delete(&models.Message{}, hardGone.ID).Error)
	require.NoError(t, db.Delete(&models.Message{}, softGone.ID).Error)

	owned := map[string]bool{goneKey: true, sharedKey: true, groupKey: true}
	repo := repos.InitRepoExpiry(db)
	remover := &deRemover{store: store, owned: owned}
	notifier := &deNotifier{}
	svc := services.NewMessageExpiryService(&deOwnedQueueRepo{RepoExpiry: repo, owned: owned}, remover, notifier, deNoMetrics{}, false)
	ctx := context.Background()

	countUnscoped := func(model interface{}, ids ...uint) int64 {
		var n int64
		require.NoError(t, db.Unscoped().Model(model).Where("id IN ?", ids).Count(&n).Error)
		return n
	}
	queued := func(keys ...string) int64 {
		var n int64
		require.NoError(t, db.Model(&models.MediaGC{}).Where("object_key IN ?", keys).Count(&n).Error)
		return n
	}
	// Unas pocas pasadas como mucho: si el job real tiene bloqueado el lote en
	// ese instante, SKIP LOCKED lo salta y la siguiente pasada ve su resultado.
	for i := 0; i < 10; i++ {
		require.NoError(t, svc.RunOnce(ctx))
		if countUnscoped(&models.Message{}, gone.ID, sharedGone.ID)+countUnscoped(&models.GroupMessage{}, ggone.ID) == 0 &&
			queued(goneKey, sharedKey, groupKey) == 0 {
			break
		}
		time.Sleep(300 * time.Millisecond)
	}

	// Borrado físico (Unscoped: ni siquiera quedan soft-deleted).
	assert.Zero(t, countUnscoped(&models.Message{}, gone.ID, sharedGone.ID), "mensajes 1:1 vencidos borrados físicamente")
	assert.Zero(t, countUnscoped(&models.GroupMessage{}, ggone.ID), "mensaje de grupo vencido borrado físicamente")
	assert.EqualValues(t, 1, countUnscoped(&models.Message{}, sharedLive.ID), "el mensaje vivo no se toca")

	// Las respuestas pierden la cita copiada pero siguen existiendo.
	var gotReply models.Message
	require.NoError(t, db.First(&gotReply, reply.ID).Error)
	assert.Nil(t, gotReply.ReplyToMessage, "el texto citado no sobrevive")
	assert.Nil(t, gotReply.ReplyToMessageID)
	assert.Nil(t, gotReply.ReplyToTelephon)
	assert.Equal(t, "de4 respuesta "+tag, gotReply.Message, "la respuesta conserva su propio texto")
	var gotGReply models.GroupMessage
	require.NoError(t, db.First(&gotGReply, greply.ID).Error)
	assert.Nil(t, gotGReply.ReplyToMessage)
	assert.Nil(t, gotGReply.ReplyToMessageID)
	assert.Nil(t, gotGReply.ReplyToTelephon)

	// Barrido de huérfanas: la respuesta cuyo objetivo se borró físicamente
	// pierde la cita; la que apunta a un soft-deleted la conserva.
	var gotOrphan, gotSoft models.Message
	require.NoError(t, db.First(&gotOrphan, orphan.ID).Error)
	assert.Nil(t, gotOrphan.ReplyToMessageID)
	assert.Nil(t, gotOrphan.ReplyToMessage)
	assert.Nil(t, gotOrphan.ReplyToTelephon)
	require.NoError(t, db.First(&gotSoft, softReply.ID).Error)
	require.NotNil(t, gotSoft.ReplyToMessageID, "un objetivo soft-deleted no es huérfano")
	assert.Equal(t, softGone.ID, *gotSoft.ReplyToMessageID)
	require.NotNil(t, gotSoft.ReplyToMessage)

	// La fila de cola ajena no se tocó (si desapareció, la procesó el job real
	// de la app, que sí ve toda la cola; esta pasada nunca la entrega).
	assert.NotContains(t, remover.removed(), foreignKey)
	if after, ok := foreignSnap(); ok {
		assert.Equal(t, foreignBefore.Attempts, after.Attempts, "attempts de la fila ajena")
		assert.True(t, foreignBefore.NextAttemptAt.Equal(after.NextAttemptAt), "next_attempt_at de la fila ajena")
		assert.Equal(t, foreignBefore.LastError, after.LastError)
	}

	// Reacciones borradas.
	var reactions int64
	require.NoError(t, db.Model(&models.MessageReaction{}).
		Where("(message_kind = ? AND message_id = ?) OR (message_kind = ? AND message_id = ?)",
			models.ReactionKindDirect, gone.ID, models.ReactionKindGroup, ggone.ID).
		Count(&reactions).Error)
	assert.Zero(t, reactions)

	// media_gc procesada: ninguna key sigue en la cola; el objeto compartido
	// sigue referenciado y nunca se pidió borrarlo; los otros ya no.
	assert.Zero(t, queued(goneKey, sharedKey, groupKey), "cola media_gc procesada")
	assert.NotContains(t, remover.removed(), sharedKey, "un objeto aún referenciado no se borra")
	ref, err := repo.MediaKeyReferenced(ctx, sharedKey)
	require.NoError(t, err)
	assert.True(t, ref, "el mensaje vivo sigue referenciando el objeto compartido")
	for _, k := range []string{goneKey, groupKey} {
		ref, err := repo.MediaKeyReferenced(ctx, k)
		require.NoError(t, err)
		assert.False(t, ref, "%s ya no está referenciado", k)
	}
	t.Logf("borrados pedidos por esta pasada: %v (el resto los hizo el job de la app)", remover.removed())

	// Si fue esta pasada la que expiró los mensajes, los avisos llevan la key
	// correcta: 1:1 a cada participante con el OTRO como key; grupo a la room.
	notifier.mu.Lock()
	defer notifier.mu.Unlock()
	for _, ev := range notifier.events {
		for _, id := range ev.payload.MessageIDs {
			switch {
			case ev.payload.Kind == "direct" && id == gone.ID:
				var key string
				require.NoError(t, json.Unmarshal(ev.payload.Key, &key))
				want := map[string]string{ana.Telephon: luis.Telephon, luis.Telephon: ana.Telephon}[ev.to]
				assert.Equal(t, want, key, "key = el otro participante (destino %s)", ev.to)
			case ev.payload.Kind == "group" && id == ggone.ID:
				assert.Equal(t, groupID, ev.groupID)
				assert.Empty(t, ev.to, "sin sender excluido")
				assert.JSONEq(t, fmt.Sprint(groupID), string(ev.payload.Key))
			}
		}
	}
}
