package repos

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/assert"
)

type fakeProbe struct {
	results []probeResult
	calls   int
}

type probeResult struct {
	out string
	err error
}

func (f *fakeProbe) probe(ctx context.Context) (string, error) {
	if ctx.Err() != nil {
		return "", ctx.Err()
	}
	if _, ok := ctx.Deadline(); !ok {
		return "", errors.New("probe sin timeout")
	}
	r := f.results[min(f.calls, len(f.results)-1)]
	f.calls++
	return r.out, r.err
}

func TestNormDetector_TransientErrorIsNotCached(t *testing.T) {
	f := &fakeProbe{results: []probeResult{{err: errors.New("connection reset")}, {out: "a"}}}
	d := &normDetector{}

	assert.False(t, d.resolve(context.Background(), f.probe), "fallo transitorio: ILIKE solo esta vez")
	assert.True(t, d.resolve(context.Background(), f.probe), "el siguiente intento vuelve a sondear y detecta norm()")
	assert.Equal(t, 2, f.calls)
	assert.True(t, d.resolve(context.Background(), f.probe))
	assert.Equal(t, 2, f.calls, "un resultado definitivo se cachea")
}

func TestNormDetector_UndefinedFunctionIsDefinitive(t *testing.T) {
	undefined := fmt.Errorf("wrap: %w", &pgconn.PgError{Code: "42883"})
	f := &fakeProbe{results: []probeResult{{err: undefined}, {out: "a"}}}
	d := &normDetector{}

	assert.False(t, d.resolve(context.Background(), f.probe))
	assert.False(t, d.resolve(context.Background(), f.probe))
	assert.Equal(t, 1, f.calls)
}

func TestNormDetector_WrongOutputIsDefinitive(t *testing.T) {
	f := &fakeProbe{results: []probeResult{{out: "Á"}, {out: "a"}}}
	d := &normDetector{}
	assert.False(t, d.resolve(context.Background(), f.probe))
	assert.False(t, d.resolve(context.Background(), f.probe))
	assert.Equal(t, 1, f.calls)
}

func TestNormDetector_CanceledCallerContextIsTransient(t *testing.T) {
	f := &fakeProbe{results: []probeResult{{out: "a"}}}
	d := &normDetector{}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	assert.False(t, d.resolve(ctx, f.probe))
	assert.True(t, d.resolve(context.Background(), f.probe))
}
