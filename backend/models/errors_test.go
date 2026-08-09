package models

import (
	"errors"
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
)

// erroresInternos son strings reales que un error interno puede contener:
// SQL, rutas de archivo, stack traces, nombres de columnas, etc. Ninguno debe
// poder llegar al cliente (C3).
var erroresInternos = []string{
	// PostgreSQL / GORM
	`pq: duplicate key value violates unique constraint "users_username_key"`,
	`SQLSTATE 23505: ERROR: duplicate key value violates unique constraint "uq_user_contact"`,
	`gorm: Error 1451: Cannot delete or update a parent row: a foreign key constraint fails`,
	`Error 1062 (23000): Duplicate entry 'testuser' for key 'users.username'`,
	`pq: relation "contact_data_bases" does not exist`,
	`column "id_user" does not exist`,
	`dial tcp 127.0.0.1:5432: connect: connection refused`,
	`sql: Scan error on column index 3: unsupported Scan, storing driver.Value type <nil>`,
	`unexpected EOF while reading postgres message`,
	// Redis
	`redis: connection pool timeout after 30s`,
	`dial tcp 127.0.0.1:6379: connect: connection refused`,
	`redis: nil response from server`,
	// Go runtime / net
	`runtime error: invalid memory address or nil pointer dereference`,
	`goroutine 1 [running]: runtime/debug.Stack()`,
	`net/http: request canceled while waiting for connection`,
	`context deadline exceeded`,
	`EOF`,
	`connection reset by peer`,
	`tls: first record does not look like a TLS handshake`,
	// Archivos / MinIO / mail
	`open /var/lib/postgresql/data/base/1/1259: permission denied`,
	`/home/user/project/backend/repos/userData.go:45`,
	`minio: The specified bucket does not exist`,
	`gopkg.in/gomail.v2: 550 5.7.1 Authentication required`,
	`crypto/bcrypt: hashedSecret too short to be a bcrypt hash`,
	`strconv.Atoi: parsing "abc": invalid syntax`,
	`json: cannot unmarshal string into Go value of type models.UserDataBase`,
}

// C3: ningún error interno puede filtrar su texto por SafeMessage.
func TestSafeMessageNeverLeaksInternalErrors(t *testing.T) {
	for _, raw := range erroresInternos {
		t.Run(shortName(raw), func(t *testing.T) {
			err := errors.New(raw)
			msg := SafeMessage(err)
			assert.Equal(t, "internal server error", msg)
			assert.NotContains(t, msg, "pq:")
			assert.NotContains(t, msg, "dial tcp")
			assert.NotContains(t, msg, ".go:")
			assert.NotContains(t, msg, "goroutine")
			assert.NotContains(t, msg, "SQLSTATE")
		})
	}
}

// Los errores envueltos (fmt.Errorf con %w) también quedan sanitizados.
func TestSafeMessageSanitizesWrappedErrors(t *testing.T) {
	raw := errors.New(`pq: relation "contact_data_bases" does not exist`)
	wrapped := fmt.Errorf("error obteniendo contactos: %w", raw)

	assert.Equal(t, "internal server error", SafeMessage(wrapped))
}

// Un AppError expone solo su Message.
func TestSafeMessageUsesAppErrorMessage(t *testing.T) {
	appErr := NewAppError(400, "codigo incorrecto", errors.New("SQLSTATE 23505: ..."))
	assert.Equal(t, "codigo incorrecto", SafeMessage(appErr))
}

// AppError en cadena: errors.As lo detecta aunque esté envuelto.
func TestSafeMessageFindsNestedAppError(t *testing.T) {
	appErr := NewAppError(401, "credenciales invalidas", errors.New("dial tcp ..."))
	wrapped := fmt.Errorf("login fallo: %w", appErr)

	assert.Equal(t, "credenciales invalidas", SafeMessage(wrapped))
	assert.True(t, IsAppError(wrapped))
}

// SafeMessage no pánico con nil.
func TestSafeMessageNil(t *testing.T) {
	assert.Equal(t, "", SafeMessage(nil))
}

// El AppError preserva el error original para logs (Unwrap).
func TestAppErrorUnwrap(t *testing.T) {
	original := errors.New("internal db failure")
	appErr := NewAppError(500, "internal server error", original)

	assert.ErrorIs(t, appErr, original)
	assert.True(t, errors.Is(fmt.Errorf("wrap: %w", appErr), original))
}

// NewAppError con Err nil no debe romper nada.
func TestNewAppErrorWithoutCause(t *testing.T) {
	appErr := NewAppError(400, "campo requerido", nil)
	assert.Equal(t, "campo requerido", appErr.SafeMessage())
	assert.Nil(t, appErr.Err)
}

func shortName(raw string) string {
	if len(raw) > 40 {
		return raw[:40]
	}
	return raw
}
