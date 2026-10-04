package utils

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/assert"
)

func TestIsInternalError(t *testing.T) {
	assert.False(t, IsInternalError(nil))
	assert.False(t, IsInternalError(errors.New("usuario no encontrado")))
	assert.True(t, IsInternalError(fmt.Errorf("buscar id: %w", &pgconn.PgError{Code: "42P01"})))
	assert.True(t, IsInternalError(fmt.Errorf("x: %w", context.DeadlineExceeded)))
	assert.True(t, IsInternalError(errors.Join(errors.New("a"), &pgconn.ConnectError{})))
}
