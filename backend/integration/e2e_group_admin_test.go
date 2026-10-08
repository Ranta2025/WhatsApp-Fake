//go:build e2e

// Administración de grupos end-to-end (HTTP + WS + Postgres reales):
// promover/descartar/remover, settings (solo admins envían / agregan / editan
// info), exclusión del removido, promoción automática del último admin que sale
// y mensajes de sistema persistidos y ordenados.
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

// e2eLogin crea un cliente HTTP y autentica al usuario devuelto por mk.
func e2eLogin(t *testing.T, base string, u models.UserDataBase) *e2eClient {
	t.Helper()
	c := newClient(t, base)
	code, body := c.do("POST", "/api/v1/auth/login", map[string]string{"username": u.Username, "password": "Passw0rd!"})
	require.Equal(t, 200, code, "login de %s: %v", u.Username, body)
	return c
}

// e2eMemberRole devuelve el rol del teléfono en la lista Members de un detail.
func e2eMemberRole(t *testing.T, detail map[string]interface{}, telephon string) string {
	t.Helper()
	for _, item := range detail["members"].([]interface{}) {
		m := item.(map[string]interface{})
		if m["telephon"] == telephon {
			role, _ := m["role"].(string)
			return role
		}
	}
	return ""
}

// e2eExpectNoEvent lee de conn hasta `wait` y falla si llega un evento del tipo
// indicado. Un timeout de lectura es el resultado esperado; ojo: gorilla deja la
// conexión inservible para lecturas posteriores tras un timeout, así que debe
// cerrarse al terminar.
func e2eExpectNoEvent(t *testing.T, conn *websocket.Conn, eventType string, wait time.Duration) {
	t.Helper()
	deadline := time.Now().Add(wait)
	for {
		remaining := time.Until(deadline)
		if remaining <= 0 {
			return
		}
		_ = conn.SetReadDeadline(time.Now().Add(remaining))
		_, msg, err := conn.ReadMessage()
		if err != nil {
			return
		}
		var ev map[string]interface{}
		if err := json.Unmarshal(msg, &ev); err != nil {
			continue
		}
		if ev["type"] == eventType {
			t.Fatalf("no debía llegar el evento %s", eventType)
		}
	}
}

func TestE2EGroupAdminPermissions(t *testing.T) {
	base := os.Getenv("E2E_BASE_URL")
	require.NotEmpty(t, base, "E2E_BASE_URL requerido")
	db, err := database.Conection()
	require.NoError(t, err)

	suffix := time.Now().UnixNano() % 1000000
	hash, err := utils.Hash("Passw0rd!")
	require.NoError(t, err)
	mk := func(name string, n int) models.UserDataBase {
		u := models.UserDataBase{User: models.User{
			Username: fmt.Sprintf("ga%s%d", name, suffix),
			Gmail:    fmt.Sprintf("ga%s%d@gmail.com", name, suffix),
			Telephon: fmt.Sprintf("+53%d%07d", n, suffix),
		}, Password: hash, Activo: true}
		require.NoError(t, db.Create(&u).Error)
		return u
	}
	ana, luis, marta, dave := mk("ana", 1), mk("luis", 2), mk("marta", 3), mk("dave", 4)

	ca, cl, cm := e2eLogin(t, base, ana), e2eLogin(t, base, luis), e2eLogin(t, base, marta)

	// Contactos: Ana con Luis/Marta/Dave (crear y añadir); Marta con Dave para
	// que su intento de añadir sea válido salvo por la restricción del grupo.
	for _, c := range []models.UserDataBase{luis, marta, dave} {
		code, body := ca.do("POST", "/api/v1/contact", map[string]string{"telephon": c.Telephon, "contactName": c.Username})
		require.Equal(t, 201, code, body)
	}
	code, body := cm.do("POST", "/api/v1/contact", map[string]string{"telephon": dave.Telephon, "contactName": dave.Username})
	require.Equal(t, 201, code, body)

	var wsAna, wsLuis, wsMarta *websocket.Conn
	t.Cleanup(func() {
		for _, c := range []*websocket.Conn{wsAna, wsLuis, wsMarta} {
			if c != nil {
				_ = c.Close()
			}
		}
	})
	wsAna, wsLuis, wsMarta = ca.ws(""), cl.ws(""), cm.ws("")
	time.Sleep(300 * time.Millisecond) // initClient une a las rooms existentes

	sendWS := func(conn *websocket.Conn, typ string, payload map[string]interface{}) {
		require.NoError(t, conn.WriteJSON(map[string]interface{}{"type": typ, "payload": payload}))
	}

	var groupID uint
	// expectedEvents acumula, en orden cronológico, los SystemEvent que cada
	// acción debe persistir; el último sub-test lo compara con el historial.
	var expectedEvents []string

	t.Run("ana crea un grupo con luis y marta", func(t *testing.T) {
		code, grp := ca.do("POST", "/api/v1/group", map[string]interface{}{
			"name":    "Equipo GA5",
			"members": []string{luis.Telephon, marta.Telephon},
		})
		require.Equal(t, 201, code, grp)

		g, ok := grp["group"].(map[string]interface{})
		require.True(t, ok, "respuesta sin group: %v", grp)
		groupID = uint(g["id"].(float64))
		require.NotZero(t, groupID)

		assert.Equal(t, "admin", g["userRole"], "Ana es admin por ser creadora")
		assert.Equal(t, false, g["onlyAdminsCanSend"])
		assert.Equal(t, false, g["onlyAdminsCanEditInfo"])
		assert.Equal(t, false, g["onlyAdminsCanAddMembers"])

		members, ok := g["members"].([]interface{})
		require.True(t, ok)
		require.Len(t, members, 3)
		roles := map[string]string{}
		for _, item := range members {
			m := item.(map[string]interface{})
			roles[m["telephon"].(string)] = m["role"].(string)
		}
		assert.Equal(t, "admin", roles[ana.Telephon])
		assert.Equal(t, "member", roles[luis.Telephon])
		assert.Equal(t, "member", roles[marta.Telephon])
	})

	t.Run("un member no puede administrar ni editar info restringida", func(t *testing.T) {
		code, body := cl.do("DELETE", fmt.Sprintf("/api/v1/group/%d/members/%s", groupID, marta.Telephon), nil)
		assert.Equal(t, 403, code, "member no puede remover: %v", body)

		pathRole := fmt.Sprintf("/api/v1/group/%d/members/%s/role", groupID, marta.Telephon)
		code, body = cl.do("PUT", pathRole, map[string]string{"role": "admin"})
		assert.Equal(t, 403, code, "member no puede promover: %v", body)

		pathSettings := fmt.Sprintf("/api/v1/group/%d/settings", groupID)
		code, body = cl.do("PATCH", pathSettings, map[string]bool{"onlyAdminsCanSend": true})
		assert.Equal(t, 403, code, "member no puede cambiar settings: %v", body)

		// Editar info es configurable y por defecto está abierto: Ana la
		// restringe y entonces el member recibe 403 (scenario "info edit" de GA5).
		code, body = ca.do("PATCH", pathSettings, map[string]bool{"onlyAdminsCanEditInfo": true})
		require.Equal(t, 200, code, body)
		expectedEvents = append(expectedEvents, models.SystemEventSettingsChanged)

		code, body = cl.do("PATCH", fmt.Sprintf("/api/v1/group/%d", groupID), map[string]string{"name": "hackeado"})
		assert.Equal(t, 403, code, "member no puede editar info restringida: %v", body)

		// Sin efectos laterales: solo cambió lo que pidió Ana y el nombre quedó intacto.
		code, detail := ca.do("GET", fmt.Sprintf("/api/v1/group/%d", groupID), nil)
		require.Equal(t, 200, code)
		assert.Equal(t, false, detail["onlyAdminsCanSend"])
		assert.Equal(t, true, detail["onlyAdminsCanEditInfo"])
		assert.Equal(t, "Equipo GA5", detail["name"])
		assert.Equal(t, "member", e2eMemberRole(t, detail, marta.Telephon))
	})

	t.Run("ana promueve a luis y luis remueve a marta", func(t *testing.T) {
		code, body := ca.do("PUT", fmt.Sprintf("/api/v1/group/%d/members/%s/role", groupID, luis.Telephon), map[string]string{"role": "admin"})
		require.Equal(t, 200, code, body)
		expectedEvents = append(expectedEvents, models.SystemEventAdminGranted)

		ev := waitFor(t, wsMarta, "group_member_role")
		p := ev["payload"].(map[string]interface{})
		assert.Equal(t, luis.Telephon, p["telephon"])
		assert.Equal(t, "admin", p["role"])

		code, body = cl.do("DELETE", fmt.Sprintf("/api/v1/group/%d/members/%s", groupID, marta.Telephon), nil)
		require.Equal(t, 200, code, body)
		expectedEvents = append(expectedEvents, models.SystemEventMemberRemoved)

		ev = waitFor(t, wsMarta, "group_member_removed")
		p = ev["payload"].(map[string]interface{})
		assert.Equal(t, marta.Telephon, p["telephon"])
		assert.EqualValues(t, 2, p["newMemberCount"])
		sys, ok := p["systemMessage"].(map[string]interface{})
		require.True(t, ok, "el evento debe traer el systemMessage: %v", p)
		assert.Equal(t, models.SystemEventMemberRemoved, sys["systemEvent"])

		// El removido pierde acceso a detalle, historial y búsqueda.
		code, _ = cm.do("GET", fmt.Sprintf("/api/v1/group/%d", groupID), nil)
		assert.Equal(t, 403, code, "detalle tras remover")
		code, _ = cm.do("GET", fmt.Sprintf("/api/v1/group/%d/message", groupID), nil)
		assert.Equal(t, 403, code, "historial tras remover")
		code, _ = cm.do("GET", fmt.Sprintf("/api/v1/group/%d/message/search?q=hola", groupID), nil)
		assert.Equal(t, 403, code, "búsqueda tras remover")

		// Y deja de recibir los mensajes de la room: Luis (miembro) sí lo recibe.
		sendWS(wsAna, "group_chat", map[string]interface{}{"groupID": groupID, "message": "solo miembros"})
		waitFor(t, wsLuis, "group_chat")
		e2eExpectNoEvent(t, wsMarta, "group_chat", 900*time.Millisecond)

		// La lectura agotada deja la conexión inservible para leer: reabrir para
		// los escenarios de envío restringido.
		_ = wsMarta.Close()
		wsMarta = cm.ws("")
		time.Sleep(300 * time.Millisecond)
	})

	t.Run("solo los admins pueden enviar", func(t *testing.T) {
		pathSettings := fmt.Sprintf("/api/v1/group/%d/settings", groupID)
		code, body := ca.do("PATCH", pathSettings, map[string]bool{"onlyAdminsCanSend": true})
		require.Equal(t, 200, code, body)
		expectedEvents = append(expectedEvents, models.SystemEventSettingsChanged)

		ev := waitFor(t, wsLuis, "group_settings")
		assert.Equal(t, true, ev["payload"].(map[string]interface{})["onlyAdminsCanSend"])

		// Marta sigue fuera del grupo: REST 403 y WS `error`, sin difusión.
		code, body = cm.do("POST", fmt.Sprintf("/api/v1/group/%d/message", groupID), map[string]string{"message": "no debería"})
		assert.Equal(t, 403, code, body)
		sendWS(wsMarta, "group_chat", map[string]interface{}{"groupID": groupID, "message": "tampoco"})
		waitFor(t, wsMarta, "error")

		// Luis (admin) sigue enviando.
		sendWS(wsLuis, "group_chat", map[string]interface{}{"groupID": groupID, "message": "hola desde admin"})
		got := waitFor(t, wsLuis, "group_chat")
		assert.Equal(t, "hola desde admin", got["payload"].(map[string]interface{})["message"])
	})

	t.Run("ana vuelve a añadir a marta", func(t *testing.T) {
		code, body := ca.do("POST", fmt.Sprintf("/api/v1/group/%d/members", groupID),
			map[string]interface{}{"members": []string{marta.Telephon}})
		require.Equal(t, 200, code, body)
		expectedEvents = append(expectedEvents, models.SystemEventMemberAdded)
		waitFor(t, wsMarta, "group_member_added")

		// Marta vuelve a ser miembro activo, pero la restricción de envío sigue.
		code, detail := cm.do("GET", fmt.Sprintf("/api/v1/group/%d", groupID), nil)
		require.Equal(t, 200, code, detail)
		assert.Equal(t, "member", e2eMemberRole(t, detail, marta.Telephon))
		assert.Equal(t, true, detail["onlyAdminsCanSend"])

		code, body = cm.do("POST", fmt.Sprintf("/api/v1/group/%d/message", groupID), map[string]string{"message": "miembro restringido"})
		assert.Equal(t, 403, code, body)
		sendWS(wsMarta, "group_chat", map[string]interface{}{"groupID": groupID, "message": "ws restringido"})
		waitFor(t, wsMarta, "error")

		sendWS(wsLuis, "group_chat", map[string]interface{}{"groupID": groupID, "message": "admin sigue"})
		waitFor(t, wsLuis, "group_chat")
	})

	t.Run("solo los admins pueden añadir participantes", func(t *testing.T) {
		pathSettings := fmt.Sprintf("/api/v1/group/%d/settings", groupID)
		code, body := ca.do("PATCH", pathSettings, map[string]bool{"onlyAdminsCanAddMembers": true})
		require.Equal(t, 200, code, body)
		expectedEvents = append(expectedEvents, models.SystemEventSettingsChanged)

		pathMembers := fmt.Sprintf("/api/v1/group/%d/members", groupID)
		// Marta es contacto de Dave: sin la restricción el alta pasaría.
		code, body = cm.do("POST", pathMembers, map[string]interface{}{"members": []string{dave.Telephon}})
		assert.Equal(t, 403, code, "member no puede añadir con la restricción activa: %v", body)

		// El admin sí puede.
		code, body = ca.do("POST", pathMembers, map[string]interface{}{"members": []string{dave.Telephon}})
		require.Equal(t, 200, code, body)
		expectedEvents = append(expectedEvents, models.SystemEventMemberAdded)

		code, detail := ca.do("GET", fmt.Sprintf("/api/v1/group/%d", groupID), nil)
		require.Equal(t, 200, code)
		assert.Equal(t, "member", e2eMemberRole(t, detail, dave.Telephon))
	})

	t.Run("el último admin sale y se promueve al más antiguo", func(t *testing.T) {
		// Dejar a Ana como única admin: descarta a Luis.
		code, body := ca.do("PUT", fmt.Sprintf("/api/v1/group/%d/members/%s/role", groupID, luis.Telephon), map[string]string{"role": "member"})
		require.Equal(t, 200, code, body)
		expectedEvents = append(expectedEvents, models.SystemEventAdminRevoked)

		// Ana (única admin) sale: el miembro activo más antiguo (Luis) es promovido.
		code, body = ca.do("DELETE", fmt.Sprintf("/api/v1/group/%d/member", groupID), nil)
		require.Equal(t, 200, code, body)
		expectedEvents = append(expectedEvents, models.SystemEventMemberLeft)

		code, detail := cl.do("GET", fmt.Sprintf("/api/v1/group/%d", groupID), nil)
		require.Equal(t, 200, code, detail)
		assert.Equal(t, "admin", detail["userRole"], "Luis debe quedar como admin tras salir el último")
		assert.Equal(t, "admin", e2eMemberRole(t, detail, luis.Telephon))
		assert.Equal(t, "member", e2eMemberRole(t, detail, marta.Telephon))
		assert.Equal(t, "member", e2eMemberRole(t, detail, dave.Telephon))
	})

	t.Run("los system messages persisten y aparecen en history en orden", func(t *testing.T) {
		code, page := cl.do("GET", fmt.Sprintf("/api/v1/group/%d/message?limit=100", groupID), nil)
		require.Equal(t, 200, code, page)
		list, ok := page["messages"].([]interface{})
		require.True(t, ok, "respuesta sin messages: %v", page)

		var got []string
		for _, item := range list {
			m := item.(map[string]interface{})
			if m["kind"] == models.GroupMessageKindSystem {
				assert.NotZero(t, m["messageID"], "un system message persistido debe tener id")
				event, _ := m["systemEvent"].(string)
				got = append(got, event)
			}
		}
		// El historial llega del más reciente al más antiguo: invertir.
		for i, j := 0, len(got)-1; i < j; i, j = i+1, j-1 {
			got[i], got[j] = got[j], got[i]
		}
		assert.Equal(t, expectedEvents, got, "system messages persistidos en orden")
	})
}
