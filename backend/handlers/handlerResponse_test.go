package handlers

import (
	"errors"
	"gorm/backend/models"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
)

// statusFromError: el código HTTP semántico lo declara el *models.AppError
// (C9: 409 para contactos duplicados); cualquier otro error usa el fallback.
func TestStatusFromError(t *testing.T) {
	dupErr := models.NewAppError(http.StatusConflict, "contacto ya existente", nil)
	plainErr := errors.New("algo interno")

	tests := []struct {
		name     string
		err      error
		fallback int
		want     int
	}{
		{"app error usa su código", dupErr, http.StatusBadRequest, http.StatusConflict},
		{"error plano usa fallback", plainErr, http.StatusBadRequest, http.StatusBadRequest},
		{"app error sin código usa fallback", models.NewAppError(0, "x", nil), http.StatusNotFound, http.StatusNotFound},
		{"nil usa fallback", nil, http.StatusInternalServerError, http.StatusInternalServerError},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, statusFromError(tt.err, tt.fallback))
		})
	}
}
