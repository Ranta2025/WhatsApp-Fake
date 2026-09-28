package app

import (
	"context"
	"errors"
	"gorm/backend/models"
	"gorm/backend/schemas"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

// fakeStatusService implementa services.StatusServicer solo para poder
// observar las llamadas a CleanupExpiredStatuses desde statusCleanupLoop;
// el resto de métodos no se ejercitan en estos tests.
type fakeStatusService struct {
	mu    sync.Mutex
	seq   []error
	next  int
	calls chan error
}

func (f *fakeStatusService) CleanupExpiredStatuses(ctx context.Context) (int64, error) {
	f.mu.Lock()
	var err error
	if f.next < len(f.seq) {
		err = f.seq[f.next]
	}
	f.next++
	f.mu.Unlock()

	f.calls <- err
	if err != nil {
		return 0, err
	}
	return 1, nil
}

func (f *fakeStatusService) CreateStatus(telephon string, input models.StatusCreate, ctx context.Context) (schemas.StatusItem, schemas.StatusOwnerBrief, []string, error) {
	return schemas.StatusItem{}, schemas.StatusOwnerBrief{}, nil, nil
}
func (f *fakeStatusService) GetFeed(telephon string, ctx context.Context) (schemas.StatusFeed, error) {
	return schemas.StatusFeed{}, nil
}
func (f *fakeStatusService) MarkStatusViewed(telephon string, statusID uint, ctx context.Context) (bool, string, schemas.StatusViewer, int64, error) {
	return false, "", schemas.StatusViewer{}, 0, nil
}
func (f *fakeStatusService) GetStatusViewers(telephon string, statusID uint, ctx context.Context) ([]schemas.StatusViewer, error) {
	return nil, nil
}
func (f *fakeStatusService) DeleteStatus(telephon string, statusID uint, ctx context.Context) ([]string, error) {
	return nil, nil
}

// ==================== R3-cleanup-loop-untested ====================

func TestStatusCleanupLoopRunsAtStartupThenPerTickSurvivesErrorsAndStopsOnCancel(t *testing.T) {
	const interval = 300 * time.Millisecond
	fake := &fakeStatusService{
		seq:   []error{errors.New("db caída temporalmente")}, // solo la 1ra llamada falla
		calls: make(chan error, 10),
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go statusCleanupLoop(ctx, fake, interval)

	// 1) corre una limpieza inmediata al arrancar, sin esperar al primer tick,
	// y sobrevive al error que devuelve esa primera llamada.
	select {
	case err := <-fake.calls:
		assert.Error(t, err)
	case <-time.After(100 * time.Millisecond):
		t.Fatal("no ejecutó la limpieza inicial al arrancar")
	}

	// 2) sigue llamando en cada tick (la 2da llamada, ya sin error).
	select {
	case err := <-fake.calls:
		assert.NoError(t, err)
	case <-time.After(interval + 200*time.Millisecond):
		t.Fatal("no ejecutó la limpieza en el siguiente tick")
	}

	// 3) se detiene al cancelar el contexto: no debe haber más llamadas.
	cancel()
	select {
	case <-fake.calls:
		t.Fatal("siguió llamando después de cancelar el contexto")
	case <-time.After(interval + 200*time.Millisecond):
	}
}
