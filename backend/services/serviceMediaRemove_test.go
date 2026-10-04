package services

import (
	"errors"
	"fmt"
	"testing"

	"github.com/minio/minio-go/v7"
	"github.com/stretchr/testify/assert"
)

func TestObjectKeyFromURL(t *testing.T) {
	cases := []struct {
		name    string
		bucket  string
		baseURL string
		url     string
		wantKey string
		wantOK  bool
	}{
		{"ruta relativa", "media", "", "/storage/media/images/2026-10/abc.jpg", "images/2026-10/abc.jpg", true},
		{"otro bucket configurado", "files", "", "/storage/files/audio/2026-10/x.webm", "audio/2026-10/x.webm", true},
		{"bucket distinto no es nuestro", "media", "", "/storage/other/images/a.jpg", "", false},
		{"URL pública", "media", "https://pub.r2.dev", "https://pub.r2.dev/videos/2026-10/v.mp4", "videos/2026-10/v.mp4", true},
		{"ruta relativa con baseURL configurada (subidas previas)", "media", "https://pub.r2.dev", "/storage/media/images/a.jpg", "images/a.jpg", true},
		{"URL externa", "media", "", "https://evil.example/images/a.jpg", "", false},
		{"prefijo de dominio sin barra no cuenta", "media", "https://pub.r2.dev", "https://pub.r2.dev.evil.com/a.jpg", "", false},
		{"vacía", "media", "", "", "", false},
		{"solo el prefijo", "media", "", "/storage/media/", "", false},
		{"traversal", "media", "", "/storage/media/../secret", "", false},
		{"query string", "media", "", "/storage/media/images/a.jpg?x=1", "", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s := &ServiceMedia{bucket: tc.bucket, baseURL: tc.baseURL}
			key, ok := s.ObjectKeyFromURL(tc.url)
			assert.Equal(t, tc.wantOK, ok)
			assert.Equal(t, tc.wantKey, key)
		})
	}
}

func TestMapRemoveError(t *testing.T) {
	assert.NoError(t, mapRemoveError(nil))
	missing := minio.ErrorResponse{Code: "NoSuchKey", Message: "no existe"}
	assert.ErrorIs(t, mapRemoveError(missing), ErrMediaObjectMissing)
	other := errors.New("conexión rechazada")
	err := mapRemoveError(other)
	assert.ErrorIs(t, err, other)
	assert.False(t, errors.Is(err, ErrMediaObjectMissing))
	assert.False(t, errors.Is(mapRemoveError(fmt.Errorf("x: %w", minio.ErrorResponse{Code: "AccessDenied"})), ErrMediaObjectMissing))
}
