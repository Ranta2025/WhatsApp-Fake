//go:build e2e

package integration

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"gorm/backend/database"
	"gorm/backend/models"
	"gorm/backend/utils"
	"io"
	"log"
	"net/http"
	"net/http/cookiejar"
	"os"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

// sharedE2ESession is one user logged in once per test binary, before any test
// runs. POST /api/v1/auth/login is limited to 20 requests per fixed one-minute
// window per IP, and the suite already uses that whole budget in a single
// window. Tests that only need "an authenticated user" borrow this session
// instead of adding their own login: the shared login lands in the first
// window, next to the earliest tests, rather than in the busiest one.
type sharedE2ESession struct {
	base string
	user models.UserDataBase
	jar  http.CookieJar
	err  error
}

var sharedSession sharedE2ESession

func TestMain(m *testing.M) {
	cleanup := setupSharedSession()
	code := m.Run()
	cleanup()
	os.Exit(code)
}

// setupSharedSession creates and logs in the shared user. A failure does not
// abort the binary: it is reported by sharedLogin to the tests that need it.
func setupSharedSession() func() {
	noop := func() {}
	base := os.Getenv("E2E_BASE_URL")
	if base == "" {
		sharedSession.err = errors.New("E2E_BASE_URL requerido")
		return noop
	}
	db, err := database.Conection()
	if err != nil {
		sharedSession.err = fmt.Errorf("conectar a la base de datos: %w", err)
		return noop
	}
	hash, err := utils.Hash("Passw0rd!")
	if err != nil {
		sharedSession.err = err
		return noop
	}
	suffix := time.Now().UnixNano() % 1000000
	user := models.UserDataBase{User: models.User{
		Username: fmt.Sprintf("shared%d", suffix),
		Gmail:    fmt.Sprintf("shared%d@gmail.com", suffix),
		Telephon: fmt.Sprintf("+514%07d", suffix),
	}, Password: hash, Activo: true}
	if err := db.Create(&user).Error; err != nil {
		sharedSession.err = fmt.Errorf("crear el usuario compartido: %w", err)
		return noop
	}
	cleanup := func() {
		// Each test removes the data it created; this only drops what is left
		// keyed by the shared user.
		for _, q := range []string{
			`DELETE FROM push_subscriptions WHERE user_id = ?`,
			`DELETE FROM chat_mutes WHERE user_id = ?`,
			`DELETE FROM user_data_bases WHERE id = ?`,
		} {
			if err := db.Exec(q, user.ID).Error; err != nil {
				log.Printf("limpieza del usuario compartido: %v", err)
			}
		}
	}

	jar, _ := cookiejar.New(nil)
	if err := loginWithoutT(base, jar, user.Username, "Passw0rd!"); err != nil {
		sharedSession.err = fmt.Errorf("login del usuario compartido: %w", err)
		return cleanup
	}
	sharedSession = sharedE2ESession{base: base, user: user, jar: jar}
	return cleanup
}

// loginWithoutT logs in outside a test (e2eClient.do needs a *testing.T).
func loginWithoutT(base string, jar http.CookieJar, username, password string) error {
	body, err := json.Marshal(map[string]string{"username": username, "password": password})
	if err != nil {
		return err
	}
	client := &http.Client{Jar: jar, Timeout: 10 * time.Second}
	resp, err := client.Post(base+"/api/v1/auth/login", "application/json", bytes.NewReader(body))
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		raw, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("status %d: %s", resp.StatusCode, raw)
	}
	return nil
}

// sharedLogin returns a client bound to t that carries the shared session,
// together with its user. It never calls /api/v1/auth/login.
func sharedLogin(t *testing.T) (*e2eClient, models.UserDataBase) {
	t.Helper()
	require.NoError(t, sharedSession.err, "sesión compartida")
	client := &e2eClient{t: t, base: sharedSession.base, http: &http.Client{Jar: sharedSession.jar, Timeout: 10 * time.Second}}
	return client, sharedSession.user
}
