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
)

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
		code, out := ca.do("GET", "/api/v1/chat/"+luis.Telephon+"/search?q=86400", nil)
		require.Equal(t, 200, code, out)
		assert.Empty(t, out["results"], "búsqueda por chat")
		code, out = ca.do("GET", "/api/v1/search?q=86400", nil)
		require.Equal(t, 200, code, out)
		for _, c := range out["chats"].([]interface{}) {
			assert.NotEqual(t, luis.Telephon, c.(map[string]interface{})["key"], "búsqueda global")
		}
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
		code, out := ca.do("GET", fmt.Sprintf("/api/v1/group/%d/message/search?q=86400", groupID), nil)
		require.Equal(t, 200, code, out)
		assert.Empty(t, out["results"])
	})
}
