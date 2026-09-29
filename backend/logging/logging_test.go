package logging

import (
	"bytes"
	"context"
	"log/slog"
	"testing"

	"github.com/stretchr/testify/assert"
)

// withCapturedDefault reemplaza el logger por defecto por un handler JSON que
// escribe en un buffer, para inspeccionar los campos emitidos.
func withCapturedDefault(t *testing.T) *bytes.Buffer {
	t.Helper()
	buf := &bytes.Buffer{}
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(buf, &slog.HandlerOptions{Level: slog.LevelDebug})))
	t.Cleanup(func() { slog.SetDefault(prev) })
	return buf
}

func TestRequestIDRoundTrip(t *testing.T) {
	ctx := WithRequestID(context.Background(), "abc-123")

	assert.Equal(t, "abc-123", RequestID(ctx))
	assert.Equal(t, "", RequestID(context.Background()), "sin id adjunto no hay request id")
}

func TestWithRequestIDIgnoresEmptyID(t *testing.T) {
	ctx := WithRequestID(context.Background(), "")

	assert.Equal(t, "", RequestID(ctx))
}

func TestFromContextAddsRequestID(t *testing.T) {
	buf := withCapturedDefault(t)

	FromContext(WithRequestID(context.Background(), "req-42")).Info("hola")

	assert.Contains(t, buf.String(), `"request_id":"req-42"`)
}

func TestFromContextWithoutRequestIDHasNoField(t *testing.T) {
	buf := withCapturedDefault(t)

	FromContext(context.Background()).Info("hola")

	assert.NotContains(t, buf.String(), "request_id")
}

func TestFromContextNilContextDoesNotPanic(t *testing.T) {
	withCapturedDefault(t)

	assert.NotPanics(t, func() { FromContext(nil).Info("hola") })
}
