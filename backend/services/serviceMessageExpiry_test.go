package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"testing"
	"time"

	"gorm/backend/models"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ─── fakes ───────────────────────────────────────────────────────────────────

type expiryBatchCall struct {
	kind  string
	limit int
}

type fakeExpiryRepo struct {
	batches   map[string][][]models.ExpiredMessage // por kind, una entrada por llamada
	calls     []expiryBatchCall
	counts    map[string]int64
	countCall []string
	batchErr  error
	keyOfSeen bool

	due        []models.MediaGC
	referenced map[string]bool
	deleted    []uint
	resched    []reschedCall
	pending    int64
}

type reschedCall struct {
	id       uint
	attempts int
	next     time.Time
	lastErr  string
}

func (f *fakeExpiryRepo) ExpireBatch(_ context.Context, kind string, limit int, keyOf func(string) (string, bool)) ([]models.ExpiredMessage, error) {
	f.calls = append(f.calls, expiryBatchCall{kind, limit})
	f.keyOfSeen = keyOf != nil
	if f.batchErr != nil {
		return nil, f.batchErr
	}
	queue := f.batches[kind]
	if len(queue) == 0 {
		return nil, nil
	}
	next := queue[0]
	f.batches[kind] = queue[1:]
	return next, nil
}

func (f *fakeExpiryRepo) CountExpired(_ context.Context, kind string) (int64, error) {
	f.countCall = append(f.countCall, kind)
	return f.counts[kind], nil
}

func (f *fakeExpiryRepo) DueMediaGC(_ context.Context, limit int) ([]models.MediaGC, error) {
	return f.due, nil
}

func (f *fakeExpiryRepo) MediaKeyReferenced(_ context.Context, key string) (bool, error) {
	return f.referenced[key], nil
}

func (f *fakeExpiryRepo) DeleteMediaGC(_ context.Context, id uint) error {
	f.deleted = append(f.deleted, id)
	return nil
}

func (f *fakeExpiryRepo) RescheduleMediaGC(_ context.Context, id uint, attempts int, next time.Time, lastErr string) error {
	f.resched = append(f.resched, reschedCall{id, attempts, next, lastErr})
	return nil
}

func (f *fakeExpiryRepo) CountMediaGC(context.Context) (int64, error) { return f.pending, nil }

type fakeMediaRemover struct {
	errs    map[string]error
	removed []string
}

func (f *fakeMediaRemover) ObjectKeyFromURL(url string) (string, bool) {
	return strings.TrimPrefix(url, "/storage/media/"), strings.HasPrefix(url, "/storage/media/")
}

func (f *fakeMediaRemover) RemoveObject(_ context.Context, key string) error {
	f.removed = append(f.removed, key)
	return f.errs[key]
}

type sentEvent struct {
	to      string // teléfono (1:1)
	groupID uint   // grupo (room)
	sender  string
	payload expiredPayload
}

type expiredPayload struct {
	Kind       string          `json:"kind"`
	Key        json.RawMessage `json:"key"`
	MessageIDs []uint          `json:"messageIDs"`
}

type fakeExpiryNotifier struct{ events []sentEvent }

func (f *fakeExpiryNotifier) SendTo(telephon string, msg []byte) {
	var env struct{ Payload expiredPayload }
	_ = json.Unmarshal(msg, &env)
	f.events = append(f.events, sentEvent{to: telephon, payload: env.Payload})
}

func (f *fakeExpiryNotifier) SendToGroup(groupID uint, sender string, msg []byte) {
	var env struct{ Payload expiredPayload }
	_ = json.Unmarshal(msg, &env)
	f.events = append(f.events, sentEvent{groupID: groupID, sender: sender, payload: env.Payload})
}

type fakeExpiryMetrics struct {
	expired map[string]int
	gc      map[string]int
	pending int64
}

func (f *fakeExpiryMetrics) MessagesExpired(kind string, n int) { f.expired[kind] += n }
func (f *fakeExpiryMetrics) MediaGCResult(result string)        { f.gc[result]++ }
func (f *fakeExpiryMetrics) SetMediaGCPending(n int64)          { f.pending = n }

var expiryNow = time.Date(2026, 10, 3, 12, 0, 0, 0, time.UTC)

func newExpiryFixture(dryRun bool) (*MessageExpiryService, *fakeExpiryRepo, *fakeMediaRemover, *fakeExpiryNotifier, *fakeExpiryMetrics) {
	repo := &fakeExpiryRepo{batches: map[string][][]models.ExpiredMessage{}, counts: map[string]int64{}, referenced: map[string]bool{}}
	media := &fakeMediaRemover{errs: map[string]error{}}
	notifier := &fakeExpiryNotifier{}
	m := &fakeExpiryMetrics{expired: map[string]int{}, gc: map[string]int{}}
	svc := NewMessageExpiryService(repo, media, notifier, m, dryRun)
	svc.now = func() time.Time { return expiryNow }
	return svc, repo, media, notifier, m
}

func direct(id, from, to uint, fromTel, toTel string) models.ExpiredMessage {
	return models.ExpiredMessage{ID: id, SenderID: from, ReceptorID: to, SenderTelephon: fromTel, ReceptorTelephon: toTel}
}

// ─── expiración ──────────────────────────────────────────────────────────────

// 1:1: cada participante recibe sus ids con key = el OTRO participante.
func TestMessageExpiry_DirectFanOutPerParticipantWithOtherAsKey(t *testing.T) {
	svc, repo, _, notifier, m := newExpiryFixture(false)
	repo.batches[models.ReactionKindDirect] = [][]models.ExpiredMessage{{
		direct(10, 1, 2, "+ana", "+luis"),
		direct(11, 2, 1, "+luis", "+ana"),
		direct(12, 1, 3, "+ana", "+marta"),
	}}

	require.NoError(t, svc.RunOnce(context.Background()))

	got := map[string][]uint{}
	for _, ev := range notifier.events {
		require.Equal(t, "direct", ev.payload.Kind)
		var key string
		require.NoError(t, json.Unmarshal(ev.payload.Key, &key))
		ids := append([]uint(nil), ev.payload.MessageIDs...)
		sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
		got[ev.to+"|"+key] = ids
	}
	assert.Equal(t, map[string][]uint{
		"+ana|+luis":  {10, 11},
		"+luis|+ana":  {10, 11},
		"+ana|+marta": {12},
		"+marta|+ana": {12},
	}, got)
	assert.Equal(t, 3, m.expired["direct"])
}

// Chat con uno mismo: un único evento (no duplicado) con key = uno mismo.
func TestMessageExpiry_SelfChatNotifiedOnce(t *testing.T) {
	svc, repo, _, notifier, _ := newExpiryFixture(false)
	repo.batches["direct"] = [][]models.ExpiredMessage{{direct(5, 1, 1, "+ana", "+ana")}}

	require.NoError(t, svc.RunOnce(context.Background()))

	require.Len(t, notifier.events, 1)
	assert.Equal(t, "+ana", notifier.events[0].to)
	assert.JSONEq(t, `"+ana"`, string(notifier.events[0].payload.Key))
}

// Grupos: un evento por grupo a la room, sin excluir a nadie (sender vacío).
func TestMessageExpiry_GroupOneEventPerRoomWithoutSender(t *testing.T) {
	svc, repo, _, notifier, m := newExpiryFixture(false)
	repo.batches["group"] = [][]models.ExpiredMessage{{
		{ID: 20, GroupID: 7}, {ID: 21, GroupID: 7}, {ID: 22, GroupID: 9},
	}}

	require.NoError(t, svc.RunOnce(context.Background()))

	byGroup := map[uint][]uint{}
	for _, ev := range notifier.events {
		require.Equal(t, "group", ev.payload.Kind)
		assert.Empty(t, ev.sender, "nadie queda excluido")
		assert.JSONEq(t, fmt.Sprint(ev.groupID), string(ev.payload.Key), "key = groupID numérico")
		byGroup[ev.groupID] = ev.payload.MessageIDs
	}
	assert.Equal(t, map[uint][]uint{7: {20, 21}, 9: {22}}, byGroup)
	assert.Equal(t, 3, m.expired["group"])
}

// El bucle pide lotes hasta que uno viene con menos filas que el límite.
func TestMessageExpiry_BatchLoopStopsWhenBatchIsShort(t *testing.T) {
	svc, repo, _, notifier, m := newExpiryFixture(false)
	svc.batchSize = 2
	repo.batches["direct"] = [][]models.ExpiredMessage{
		{direct(1, 1, 2, "+a", "+b"), direct(2, 1, 2, "+a", "+b")},
		{direct(3, 1, 2, "+a", "+b"), direct(4, 1, 2, "+a", "+b")},
		{direct(5, 1, 2, "+a", "+b")},
		{direct(6, 1, 2, "+a", "+b")}, // nunca se pide
	}

	require.NoError(t, svc.RunOnce(context.Background()))

	var directCalls int
	for _, c := range repo.calls {
		assert.Equal(t, 2, c.limit)
		if c.kind == "direct" {
			directCalls++
		}
	}
	assert.Equal(t, 3, directCalls, "se detiene tras el lote corto")
	assert.Equal(t, 5, m.expired["direct"])
	assert.Len(t, notifier.events, 6, "una notificación por lote y participante")
	assert.True(t, repo.keyOfSeen, "el repo recibe la derivación de object keys")
}

// Un lote vacío no notifica nada y corta enseguida.
func TestMessageExpiry_EmptyBatchStops(t *testing.T) {
	svc, repo, _, notifier, _ := newExpiryFixture(false)

	require.NoError(t, svc.RunOnce(context.Background()))

	assert.Equal(t, []expiryBatchCall{{"direct", svc.batchSize}, {"group", svc.batchSize}}, repo.calls)
	assert.Empty(t, notifier.events)
}

// El tope de lotes por pasada evita un bucle sin fin si el repo nunca acorta.
func TestMessageExpiry_MaxBatchesPerRunBounded(t *testing.T) {
	svc, repo, _, _, _ := newExpiryFixture(false)
	svc.batchSize = 1
	for i := 0; i < maxExpiryBatchesPerRun+5; i++ {
		repo.batches["direct"] = append(repo.batches["direct"], []models.ExpiredMessage{direct(uint(i+1), 1, 2, "+a", "+b")})
	}

	require.NoError(t, svc.RunOnce(context.Background()))

	var directCalls int
	for _, c := range repo.calls {
		if c.kind == "direct" {
			directCalls++
		}
	}
	assert.Equal(t, maxExpiryBatchesPerRun, directCalls)
}

// Un error de un tipo no impide procesar el otro; RunOnce devuelve el error.
func TestMessageExpiry_ErrorIsReturnedAndOtherKindStillRuns(t *testing.T) {
	svc, repo, _, _, _ := newExpiryFixture(false)
	repo.batchErr = errors.New("db caída")

	err := svc.RunOnce(context.Background())

	require.Error(t, err)
	assert.Equal(t, []expiryBatchCall{{"direct", svc.batchSize}, {"group", svc.batchSize}}, repo.calls)
}

// Dry-run: solo cuenta (SELECT), no borra, no notifica, no toca media_gc.
func TestMessageExpiry_DryRunDeletesNothing(t *testing.T) {
	svc, repo, media, notifier, m := newExpiryFixture(true)
	repo.counts = map[string]int64{"direct": 4, "group": 2}
	repo.batches["direct"] = [][]models.ExpiredMessage{{direct(1, 1, 2, "+a", "+b")}}
	repo.due = []models.MediaGC{{ID: 1, ObjectKey: "images/x.jpg"}}

	require.NoError(t, svc.RunOnce(context.Background()))

	assert.Empty(t, repo.calls, "no se llama a ExpireBatch")
	assert.Equal(t, []string{"direct", "group"}, repo.countCall)
	assert.Empty(t, notifier.events)
	assert.Empty(t, media.removed)
	assert.Empty(t, repo.deleted)
	assert.Empty(t, m.expired)
}

// ─── cola media_gc ───────────────────────────────────────────────────────────

func TestMediaGC_SuccessDeletesRow(t *testing.T) {
	svc, repo, media, _, m := newExpiryFixture(false)
	repo.due = []models.MediaGC{{ID: 3, ObjectKey: "images/a.jpg"}}
	repo.pending = 0

	require.NoError(t, svc.RunOnce(context.Background()))

	assert.Equal(t, []string{"images/a.jpg"}, media.removed)
	assert.Equal(t, []uint{3}, repo.deleted)
	assert.Empty(t, repo.resched)
	assert.Equal(t, 1, m.gc["ok"])
}

func TestMediaGC_FailureIncrementsAttemptsWithBackoff(t *testing.T) {
	svc, repo, media, _, m := newExpiryFixture(false)
	repo.due = []models.MediaGC{
		{ID: 1, ObjectKey: "images/first.jpg", Attempts: 0},
		{ID: 2, ObjectKey: "images/third.jpg", Attempts: 2},
		{ID: 3, ObjectKey: "images/capped.jpg", Attempts: 6},
	}
	for _, k := range []string{"images/first.jpg", "images/third.jpg", "images/capped.jpg"} {
		media.errs[k] = errors.New("minio caído")
	}
	repo.pending = 3

	require.NoError(t, svc.RunOnce(context.Background()))

	assert.Empty(t, repo.deleted)
	require.Len(t, repo.resched, 3)
	assert.Equal(t, reschedCall{1, 1, expiryNow.Add(2 * time.Minute), "minio caído"}, repo.resched[0])
	assert.Equal(t, reschedCall{2, 3, expiryNow.Add(8 * time.Minute), "minio caído"}, repo.resched[1])
	assert.Equal(t, reschedCall{3, 7, expiryNow.Add(128 * time.Minute), "minio caído"}, repo.resched[2])
	assert.Equal(t, 3, m.gc["failed"])
	assert.EqualValues(t, 3, m.pending)
}

func TestMediaGC_GivesUpAfterMaxAttempts(t *testing.T) {
	svc, repo, media, _, m := newExpiryFixture(false)
	repo.due = []models.MediaGC{{ID: 9, ObjectKey: "images/dead.jpg", Attempts: maxMediaGCAttempts - 1}}
	media.errs["images/dead.jpg"] = errors.New("access denied")

	require.NoError(t, svc.RunOnce(context.Background()))

	assert.Equal(t, []uint{9}, repo.deleted, "se abandona: la fila sale de la cola")
	assert.Empty(t, repo.resched)
	assert.Equal(t, 1, m.gc["gave_up"])
	assert.Zero(t, m.gc["failed"])
}

func TestMediaGC_ReferencedKeySkippedAndNotRemoved(t *testing.T) {
	svc, repo, media, _, m := newExpiryFixture(false)
	repo.due = []models.MediaGC{{ID: 4, ObjectKey: "images/shared.jpg"}}
	repo.referenced["images/shared.jpg"] = true

	require.NoError(t, svc.RunOnce(context.Background()))

	assert.Empty(t, media.removed, "un objeto aún referenciado no se borra")
	assert.Equal(t, []uint{4}, repo.deleted, "la fila sale de la cola")
	assert.Equal(t, 1, m.gc["skipped_referenced"])
}

func TestMediaGC_MissingObjectCountsAsSuccess(t *testing.T) {
	svc, repo, media, _, m := newExpiryFixture(false)
	repo.due = []models.MediaGC{{ID: 5, ObjectKey: "images/gone.jpg", Attempts: 3}}
	media.errs["images/gone.jpg"] = fmt.Errorf("remove: %w", ErrMediaObjectMissing)

	require.NoError(t, svc.RunOnce(context.Background()))

	assert.Equal(t, []uint{5}, repo.deleted)
	assert.Empty(t, repo.resched)
	assert.Equal(t, 1, m.gc["ok"])
}

func TestMediaGCBackoff(t *testing.T) {
	cases := []struct {
		attempts int
		want     time.Duration
	}{
		{1, 2 * time.Minute},
		{2, 4 * time.Minute},
		{3, 8 * time.Minute},
		{8, 256 * time.Minute},
		{9, maxMediaGCBackoff},
		{40, maxMediaGCBackoff},
	}
	for _, tc := range cases {
		t.Run(fmt.Sprint(tc.attempts), func(t *testing.T) {
			assert.Equal(t, tc.want, mediaGCBackoff(tc.attempts))
		})
	}
}
