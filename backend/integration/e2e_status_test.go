//go:build e2e

// R3-mutual-contact-sql-unproved: prueba end-to-end de la visibilidad de
// Estados por contactos MUTUOS, contra el SQL real de GetMutualContactIDs /
// IsMutualContact (backend/repos/statusData.go), no contra mocks.
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

	"github.com/stretchr/testify/require"
)

// TestE2EStatusMutualVisibility prueba, contra el stack real (HTTP + Postgres),
// que:
//   - dos contactos MUTUOS (ambos se agregaron) se ven los estados entre sí;
//   - un contacto UNIDIRECCIONAL (solo uno de los dos agregó al otro) NO ve el
//     estado en su feed y recibe 403 si intenta marcarlo como visto;
//   - marcar como visto es idempotente: una segunda vista no duplica la fila
//     ni infla la lista de espectadores del dueño.
func TestE2EStatusMutualVisibility(t *testing.T) {
	base := os.Getenv("E2E_BASE_URL")
	require.NotEmpty(t, base, "E2E_BASE_URL requerido")
	db, err := database.Conection()
	require.NoError(t, err)

	suffix := time.Now().UnixNano() % 1000000
	hash, err := utils.Hash("Passw0rd!")
	require.NoError(t, err)
	mk := func(name string, n int) models.UserDataBase {
		u := models.UserDataBase{User: models.User{
			Username: fmt.Sprintf("st%s%d", name, suffix),
			Gmail:    fmt.Sprintf("st%s%d@gmail.com", name, suffix),
			Telephon: fmt.Sprintf("+51%d%07d", n, suffix),
		}, Password: hash, Activo: true}
		require.NoError(t, db.Create(&u).Error)
		return u
	}
	alice, bob, carol := mk("alice", 1), mk("bob", 2), mk("carol", 3)

	// Limpieza al final: statuses/vistas propias + los contactos + los 3 usuarios.
	// Se hace en orden seguro para FKs (vistas -> estados -> contactos -> usuarios).
	t.Cleanup(func() {
		userIDs := []uint{alice.ID, bob.ID, carol.ID}
		db.Exec(`DELETE FROM status_views WHERE viewer_id IN ? OR status_id IN (SELECT id FROM statuses WHERE user_id IN ?)`, userIDs, userIDs)
		db.Exec(`DELETE FROM statuses WHERE user_id IN ?`, userIDs)
		db.Exec(`DELETE FROM contact_data_bases WHERE id_user IN ? OR id_contact IN ?`, userIDs, userIDs)
		db.Exec(`DELETE FROM user_data_bases WHERE id IN ?`, userIDs)
	})

	ca, cb, cc := newClient(t, base), newClient(t, base), newClient(t, base)
	login := func(c *e2eClient, u models.UserDataBase) {
		code, _ := c.do("POST", "/api/v1/auth/login", map[string]string{"username": u.Username, "password": "Passw0rd!"})
		require.Equal(t, 200, code)
	}
	login(ca, alice)
	login(cb, bob)
	login(cc, carol)

	// Alice y Bob se agregan mutuamente. Alice agrega a Carol, pero Carol
	// nunca agrega a Alice: relación unidireccional, no mutua.
	code, _ := ca.do("POST", "/api/v1/contact", map[string]string{"telephon": bob.Telephon, "contactName": "Bob"})
	require.Equal(t, 201, code)
	code, _ = cb.do("POST", "/api/v1/contact", map[string]string{"telephon": alice.Telephon, "contactName": "Alice"})
	require.Equal(t, 201, code)
	code, _ = ca.do("POST", "/api/v1/contact", map[string]string{"telephon": carol.Telephon, "contactName": "Carol"})
	require.Equal(t, 201, code)

	// Alice publica un estado de texto.
	code, created := ca.do("POST", "/api/v1/status", map[string]interface{}{"type": "text", "text": "hola mutuos"})
	require.Equal(t, 200, code, created)
	statusID := int(created["status"].(map[string]interface{})["id"].(float64))

	t.Run("mutual contact sees the status in feed", func(t *testing.T) {
		code, feed := cb.do("GET", "/api/v1/status", nil)
		require.Equal(t, 200, code)
		contacts, _ := feed["contacts"].([]interface{})
		found := false
		for _, raw := range contacts {
			group := raw.(map[string]interface{})
			if group["telephon"] == alice.Telephon {
				found = true
				statuses := group["statuses"].([]interface{})
				require.Len(t, statuses, 1)
			}
		}
		require.True(t, found, "bob (mutuo) debe ver el estado de alice en su feed")
	})

	t.Run("one-directional contact does not see it and gets 403 on view", func(t *testing.T) {
		code, feed := cc.do("GET", "/api/v1/status", nil)
		require.Equal(t, 200, code)
		contacts, _ := feed["contacts"].([]interface{})
		for _, raw := range contacts {
			group := raw.(map[string]interface{})
			require.NotEqual(t, alice.Telephon, group["telephon"], "carol (unidireccional) NO debe ver el estado de alice")
		}

		code, _ = cc.do("POST", fmt.Sprintf("/api/v1/status/%d/view", statusID), nil)
		require.Equal(t, 403, code, "carol no es contacto mutuo de alice: debe recibir 403 al intentar ver su estado")
	})

	t.Run("view is idempotent: second view does not duplicate", func(t *testing.T) {
		code, _ := cb.do("POST", fmt.Sprintf("/api/v1/status/%d/view", statusID), nil)
		require.Equal(t, 200, code)
		code, _ = cb.do("POST", fmt.Sprintf("/api/v1/status/%d/view", statusID), nil)
		require.Equal(t, 200, code, "una segunda vista del mismo estado no debe fallar")

		code, viewersResp := ca.do("GET", fmt.Sprintf("/api/v1/status/%d/views", statusID), nil)
		require.Equal(t, 200, code)
		viewers := viewersResp["viewers"].([]interface{})
		require.Len(t, viewers, 1, "la vista duplicada no debe generar una segunda entrada")
		assert_ := viewers[0].(map[string]interface{})
		require.Equal(t, bob.Telephon, assert_["telephon"])
	})
}
