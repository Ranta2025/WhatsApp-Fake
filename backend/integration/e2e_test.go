//go:build e2e

// Prueba end-to-end contra un backend en ejecución.
//
//	E2E_BASE_URL=http://127.0.0.1:8080 go test -tags e2e ./backend/integration/
//
// Usa las variables POSTGRES_* / DATABASE_URL del mismo backend para crear los
// usuarios de prueba directamente (el registro real requiere enviar emails).
package integration

import (
	"bytes"
	"encoding/json"
	"fmt"
	"gorm/backend/database"
	"gorm/backend/models"
	"gorm/backend/utils"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type e2eClient struct {
	t    *testing.T
	base string
	http *http.Client
}

func newClient(t *testing.T, base string) *e2eClient {
	jar, _ := cookiejar.New(nil)
	return &e2eClient{t: t, base: base, http: &http.Client{Jar: jar, Timeout: 10 * time.Second}}
}

func (c *e2eClient) do(method, path string, body interface{}) (int, map[string]interface{}) {
	var r io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		r = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, c.base+path, r)
	require.NoError(c.t, err)
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(req)
	require.NoError(c.t, err)
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	var out map[string]interface{}
	_ = json.Unmarshal(raw, &out)
	if out == nil {
		out = map[string]interface{}{"_raw": string(raw)}
	}
	return resp.StatusCode, out
}

type rawResponse struct {
	status int
	header http.Header
	body   []byte
}

// raw hace una petición GET/DELETE sin cuerpo y devuelve estado, cabeceras y cuerpo tal cual.
func (c *e2eClient) raw(method, path string) rawResponse {
	req, err := http.NewRequest(method, c.base+path, nil)
	require.NoError(c.t, err)
	resp, err := c.http.Do(req)
	require.NoError(c.t, err)
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	return rawResponse{status: resp.StatusCode, header: resp.Header, body: body}
}

func (c *e2eClient) ws(query string) *websocket.Conn {
	u, _ := url.Parse(c.base)
	wsURL := "ws://" + u.Host + "/api/v1/ws" + query
	header := http.Header{}
	for _, ck := range c.http.Jar.Cookies(u) {
		header.Add("Cookie", ck.Name+"="+ck.Value)
	}
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, header)
	require.NoError(c.t, err)
	return conn
}

func waitFor(t *testing.T, conn *websocket.Conn, eventType string) map[string]interface{} {
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		conn.SetReadDeadline(deadline)
		_, msg, err := conn.ReadMessage()
		require.NoError(t, err)
		var ev map[string]interface{}
		require.NoError(t, json.Unmarshal(msg, &ev))
		if ev["type"] == eventType {
			return ev
		}
	}
	t.Fatalf("no llegó el evento %s", eventType)
	return nil
}

func TestE2E(t *testing.T) {
	base := os.Getenv("E2E_BASE_URL")
	require.NotEmpty(t, base, "E2E_BASE_URL requerido")
	db, err := database.Conection()
	require.NoError(t, err)

	suffix := time.Now().UnixNano() % 1000000
	hash, _ := utils.Hash("Passw0rd!")
	mk := func(name string, n int) models.UserDataBase {
		u := models.UserDataBase{User: models.User{
			Username: fmt.Sprintf("%s%d", name, suffix),
			Gmail:    fmt.Sprintf("%s%d@gmail.com", name, suffix),
			Telephon: fmt.Sprintf("+50%d%07d", n, suffix),
		}, Password: hash, Activo: true}
		require.NoError(t, db.Create(&u).Error)
		return u
	}
	alice, bob := mk("alice", 1), mk("bob", 2)

	ca, cb := newClient(t, base), newClient(t, base)
	code, _ := ca.do("POST", "/api/v1/auth/login", map[string]string{"username": alice.Username, "password": "wrong"})
	assert.Equal(t, 401, code)
	code, _ = ca.do("POST", "/api/v1/auth/login", map[string]string{"username": alice.Username, "password": "Passw0rd!"})
	require.Equal(t, 200, code)
	code, _ = cb.do("POST", "/api/v1/auth/login", map[string]string{"username": bob.Username, "password": "Passw0rd!"})
	require.Equal(t, 200, code)

	code, me := ca.do("GET", "/api/v1/user", nil)
	require.Equal(t, 200, code)
	assert.Equal(t, alice.Telephon, me["Telephon"])

	code, _ = ca.do("POST", "/api/v1/contact", map[string]string{"number": bob.Telephon, "contact_name": "Bob"})
	require.Equal(t, 201, code)

	// Bob abre el WS con ticket (flujo cross-domain), Alice con cookie
	code, tk := cb.do("GET", "/api/v1/ws-ticket", nil)
	require.Equal(t, 200, code)
	wsBob := cb.ws("?ticket=" + tk["ticket"].(string))
	defer wsBob.Close()
	wsAlice := ca.ws("")
	defer wsAlice.Close()
	waitFor(t, wsAlice, "contacts_online")
	waitFor(t, wsBob, "contacts_online")

	// El ticket es de un solo uso
	u, _ := url.Parse(base)
	_, resp, err := websocket.DefaultDialer.Dial("ws://"+u.Host+"/api/v1/ws?ticket="+tk["ticket"].(string), nil)
	assert.Error(t, err)
	if resp != nil {
		assert.Equal(t, 401, resp.StatusCode)
	}

	// Chat 1:1 en tiempo real
	require.NoError(t, wsAlice.WriteJSON(map[string]interface{}{"type": "chat", "payload": map[string]string{"receptor": bob.Telephon, "message": "hola bob"}}))
	ev := waitFor(t, wsBob, "chat")
	assert.Equal(t, "hola bob", ev["payload"].(map[string]interface{})["Message"])
	assert.Equal(t, "entregado", ev["payload"].(map[string]interface{})["Status"])

	// URL peligrosa rechazada
	require.NoError(t, wsAlice.WriteJSON(map[string]interface{}{"type": "chat", "payload": map[string]string{"receptor": bob.Telephon, "message": "x", "mediaUrl": "javascript:alert(1)", "mediaType": "document"}}))
	waitFor(t, wsAlice, "error")

	code, _ = cb.do("GET", "/api/v1/chats", nil)
	assert.Equal(t, 200, code)

	// Subida de imagen a MinIO
	png := []byte("\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89")
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	part, _ := mw.CreatePart(map[string][]string{
		"Content-Disposition": {`form-data; name="file"; filename="a.png"`},
		"Content-Type":        {"image/png"},
	})
	part.Write(png)
	mw.Close()
	req, _ := http.NewRequest("POST", base+"/api/v1/upload", &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	uploadResp, err := ca.http.Do(req)
	require.NoError(t, err)
	var up map[string]interface{}
	json.NewDecoder(uploadResp.Body).Decode(&up)
	uploadResp.Body.Close()
	require.Equal(t, 200, uploadResp.StatusCode, up)
	assert.True(t, strings.HasPrefix(up["url"].(string), "/storage/"))

	// HTML disfrazado de imagen: rechazado
	buf.Reset()
	mw = multipart.NewWriter(&buf)
	part, _ = mw.CreatePart(map[string][]string{
		"Content-Disposition": {`form-data; name="file"; filename="x.png"`},
		"Content-Type":        {"image/png"},
	})
	part.Write([]byte("<html><script>alert(1)</script></html>"))
	mw.Close()
	req, _ = http.NewRequest("POST", base+"/api/v1/upload", &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	badResp, err := ca.http.Do(req)
	require.NoError(t, err)
	badResp.Body.Close()
	assert.Equal(t, 400, badResp.StatusCode)

	// Grupos
	code, grp := ca.do("POST", "/api/v1/group", map[string]interface{}{"name": "Equipo", "members": []string{bob.Telephon}})
	require.Equal(t, 201, code, grp)
	groupID := grp["group"].(map[string]interface{})["ID"].(float64)
	assert.Equal(t, "admin", grp["group"].(map[string]interface{})["UserRole"])
	waitFor(t, wsBob, "group_added")
	code, _ = ca.do("POST", fmt.Sprintf("/api/v1/group/%d/members", int(groupID)), map[string]interface{}{"members": []string{bob.Telephon}})
	assert.Equal(t, 200, code, "añadir un miembro existente no debe fallar")
	time.Sleep(200 * time.Millisecond)
	require.NoError(t, wsAlice.WriteJSON(map[string]interface{}{"type": "group_chat", "payload": map[string]interface{}{"groupID": groupID, "message": "hola grupo"}}))
	ev = waitFor(t, wsBob, "group_chat")
	assert.Equal(t, "hola grupo", ev["payload"].(map[string]interface{})["Message"])

	// Media en grupo: ida y vuelta con mediaUrl/mediaType y rechazo de URL peligrosa
	require.NoError(t, wsAlice.WriteJSON(map[string]interface{}{"type": "group_chat", "payload": map[string]interface{}{"groupID": groupID, "message": "", "mediaUrl": up["url"], "mediaType": "image"}}))
	ev = waitFor(t, wsBob, "group_chat")
	assert.Equal(t, up["url"], ev["payload"].(map[string]interface{})["MediaUrl"])
	assert.Equal(t, "image", ev["payload"].(map[string]interface{})["MediaType"])
	require.NoError(t, wsAlice.WriteJSON(map[string]interface{}{"type": "group_chat", "payload": map[string]interface{}{"groupID": groupID, "message": "x", "mediaUrl": "javascript:alert(1)", "mediaType": "document"}}))
	waitFor(t, wsAlice, "error")

	code, groups := cb.do("GET", "/api/v1/group", nil)
	require.Equal(t, 200, code)
	assert.Len(t, groups["groups"], 1)

	// Refresh sin access token + rotación
	aliceURL, _ := url.Parse(base)
	var refreshCookie *http.Cookie
	for _, ck := range ca.http.Jar.Cookies(aliceURL) {
		if ck.Name == "refresh_token" {
			refreshCookie = ck
		}
	}
	require.NotNil(t, refreshCookie)
	onlyRefresh := newClient(t, base)
	onlyRefresh.http.Jar.SetCookies(aliceURL, []*http.Cookie{{Name: "refresh_token", Value: refreshCookie.Value}})
	code, _ = onlyRefresh.do("POST", "/api/v1/auth/refresh", nil)
	assert.Equal(t, 200, code)
	reuse := newClient(t, base)
	reuse.http.Jar.SetCookies(aliceURL, []*http.Cookie{{Name: "refresh_token", Value: refreshCookie.Value}})
	code, _ = reuse.do("POST", "/api/v1/auth/refresh", nil)
	assert.Equal(t, 401, code, "un refresh token usado no debe volver a servir")

	code, _ = cb.do("POST", "/api/v1/auth/logout", nil)
	assert.Equal(t, 200, code)
}
