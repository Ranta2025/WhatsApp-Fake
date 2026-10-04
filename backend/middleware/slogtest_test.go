package middleware

import (
	"context"
	"log/slog"
	"sync"
	"testing"
)

// capturedRecord es una copia simple de un slog.Record para poder inspeccionar
// nivel, mensaje y atributos (aplanados) en los tests.
type capturedRecord struct {
	level   slog.Level
	message string
	attrs   map[string]string
}

// captureHandler implementa slog.Handler guardando los records en memoria.
type captureHandler struct {
	mu      *sync.Mutex
	records *[]capturedRecord
	attrs   []slog.Attr
}

func (h *captureHandler) Enabled(context.Context, slog.Level) bool { return true }

func (h *captureHandler) Handle(_ context.Context, r slog.Record) error {
	rec := capturedRecord{level: r.Level, message: r.Message, attrs: map[string]string{}}
	for _, a := range h.attrs {
		rec.attrs[a.Key] = a.Value.String()
	}
	r.Attrs(func(a slog.Attr) bool {
		rec.attrs[a.Key] = a.Value.String()
		return true
	})
	h.mu.Lock()
	*h.records = append(*h.records, rec)
	h.mu.Unlock()
	return nil
}

func (h *captureHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	merged := make([]slog.Attr, 0, len(h.attrs)+len(attrs))
	merged = append(merged, h.attrs...)
	merged = append(merged, attrs...)
	return &captureHandler{mu: h.mu, records: h.records, attrs: merged}
}

func (h *captureHandler) WithGroup(string) slog.Handler { return h }

// captureSlog reemplaza el logger por defecto durante el test y devuelve el
// último record emitido y todos los records.
type slogCapture struct {
	last    func(t *testing.T) capturedRecord
	records func() []capturedRecord
}

func captureSlog(t *testing.T) *slogCapture {
	t.Helper()
	var mu sync.Mutex
	var records []capturedRecord
	handler := &captureHandler{mu: &mu, records: &records}
	prev := slog.Default()
	slog.SetDefault(slog.New(handler))
	t.Cleanup(func() { slog.SetDefault(prev) })

	return &slogCapture{
		last: func(t *testing.T) capturedRecord {
			t.Helper()
			mu.Lock()
			defer mu.Unlock()
			if len(records) == 0 {
				t.Fatal("no se emitió ningún registro de log")
			}
			return records[len(records)-1]
		},
		records: func() []capturedRecord {
			mu.Lock()
			defer mu.Unlock()
			out := make([]capturedRecord, len(records))
			copy(out, records)
			return out
		},
	}
}
