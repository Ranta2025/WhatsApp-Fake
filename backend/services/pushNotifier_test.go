package services

import (
	"context"
	"encoding/json"
	"errors"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"gorm/backend/config"
	"gorm/backend/models"
	"gorm/backend/schemas"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ─────────────────────────────────────────────────────────────────────────────
// Fakes del despacho de Web Push (seguros para usarse desde los workers)
// ─────────────────────────────────────────────────────────────────────────────

type fakePushDispatchRepo struct {
	mu       sync.Mutex
	targets  []models.PushTarget // todas las suscripciones conocidas
	asked    [][]string
	deleted  []uint
	marked   []uint
	listErr  error
	markedAt time.Time
}

func (f *fakePushDispatchRepo) ListPushTargetsByTelephons(telephons []string, _ context.Context) ([]models.PushTarget, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	sorted := append([]string(nil), telephons...)
	sort.Strings(sorted)
	f.asked = append(f.asked, sorted)
	if f.listErr != nil {
		return nil, f.listErr
	}
	want := map[string]bool{}
	for _, t := range telephons {
		want[t] = true
	}
	var out []models.PushTarget
	for _, t := range f.targets {
		if want[t.Telephon] {
			out = append(out, t)
		}
	}
	return out, nil
}

func (f *fakePushDispatchRepo) DeleteSubscriptionByID(id uint, _ context.Context) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.deleted = append(f.deleted, id)
	return nil
}

func (f *fakePushDispatchRepo) MarkSubscriptionSuccess(id uint, at time.Time, _ context.Context) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.marked = append(f.marked, id)
	f.markedAt = at
	return nil
}

type fakePushDirectory struct {
	usernames map[string]string
	members   map[uint][]string
	groups    map[uint]string
}

func (f *fakePushDirectory) GetUsernameByTelephon(telephon string, _ context.Context) (string, error) {
	if u, ok := f.usernames[telephon]; ok {
		return u, nil
	}
	return "", errors.New("username no encontrado")
}

func (f *fakePushDirectory) GetMemberTelephons(groupID uint, _ context.Context) ([]string, error) {
	return f.members[groupID], nil
}

func (f *fakePushDirectory) GetGroupByID(groupID uint, _ context.Context) (*models.Group, error) {
	name, ok := f.groups[groupID]
	if !ok {
		return nil, errors.New("grupo no encontrado")
	}
	return &models.Group{Name: name}, nil
}

type sentPush struct {
	sub     models.PushSubscription
	payload map[string]interface{}
}

type fakePushSender struct {
	mu    sync.Mutex
	sent  []sentPush
	errOf map[uint]error // error por id de suscripción
}

func (f *fakePushSender) Send(_ context.Context, sub models.PushSubscription, payload []byte) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	var m map[string]interface{}
	_ = json.Unmarshal(payload, &m)
	f.sent = append(f.sent, sentPush{sub: sub, payload: m})
	return f.errOf[sub.ID]
}

func (f *fakePushSender) sentIDs() []uint {
	f.mu.Lock()
	defer f.mu.Unlock()
	ids := make([]uint, 0, len(f.sent))
	for _, s := range f.sent {
		ids = append(ids, s.sub.ID)
	}
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
	return ids
}

func pushTarget(id uint, telephon string, previewDisabled bool) models.PushTarget {
	return models.PushTarget{
		PushSubscription:    models.PushSubscription{ID: id, Endpoint: "https://fcm.googleapis.com/" + telephon},
		Telephon:            telephon,
		PushPreviewDisabled: previewDisabled,
	}
}

type pushHarness struct {
	repo   *fakePushDispatchRepo
	dir    *fakePushDirectory
	sender *fakePushSender
	d      *PushDispatcher
}

func newPushHarness(t *testing.T, cfg config.PushConfig, targets ...models.PushTarget) *pushHarness {
	t.Helper()
	h := &pushHarness{
		repo: &fakePushDispatchRepo{targets: targets},
		dir: &fakePushDirectory{
			usernames: map[string]string{"+1": "ana", "+2": "luis", "+3": "marta", "+4": "zoe"},
			members:   map[uint][]string{7: {"+1", "+2", "+3", "+4"}},
			groups:    map[uint]string{7: "Familia"},
		},
		sender: &fakePushSender{errOf: map[uint]error{}},
	}
	h.d = NewPushDispatcher(cfg, PushDispatcherDeps{Repo: h.repo, Users: h.dir, Groups: h.dir, Sender: h.sender})
	t.Cleanup(h.d.Close)
	return h
}

var dispatchPushCfg = config.PushConfig{Enabled: true, Preview: true, Subject: "mailto:a@b.c"}

func directMsg(text string) schemas.Message {
	return schemas.Message{MessageID: 42, SenderTelephon: "+1", Receptor: "+2", Message: text}
}

func groupMsg(text string) schemas.GroupMessageResponse {
	return schemas.GroupMessageResponse{MessageID: 9, GroupID: 7, SenderTelephon: "+1", SenderUsername: "ana", Message: text}
}

// ─────────────────────────────────────────────────────────────────────────────
// Directos
// ─────────────────────────────────────────────────────────────────────────────

func TestPushNotifier_DirectSendsOncePerSubscription(t *testing.T) {
	h := newPushHarness(t, dispatchPushCfg, pushTarget(10, "+2", false), pushTarget(11, "+2", false), pushTarget(12, "+3", false))

	h.d.NotifyDirect("+2", "+1", directMsg("hola"))
	h.d.Close()

	assert.Equal(t, []uint{10, 11}, h.sender.sentIDs())
	assert.Equal(t, [][]string{{"+2"}}, h.repo.asked)
	p := h.sender.sent[0].payload
	assert.Equal(t, "direct", p["kind"])
	assert.Equal(t, "ana", p["title"])
	assert.Equal(t, "hola", p["body"])
	assert.Equal(t, "+1", p["telephon"])
	assert.ElementsMatch(t, []uint{10, 11}, h.repo.marked, "last_success_at tras un envío correcto")
	assert.False(t, h.repo.markedAt.IsZero())
}

func TestPushNotifier_GoneDeletesSubscription(t *testing.T) {
	h := newPushHarness(t, dispatchPushCfg, pushTarget(10, "+2", false), pushTarget(11, "+2", false))
	h.sender.errOf[10] = ErrPushGone

	h.d.NotifyDirect("+2", "+1", directMsg("hola"))
	h.d.Close()

	assert.Equal(t, []uint{10}, h.repo.deleted)
	assert.Equal(t, []uint{11}, h.repo.marked)
}

func TestPushNotifier_EndpointNotAllowedDeletesSubscription(t *testing.T) {
	h := newPushHarness(t, dispatchPushCfg, pushTarget(10, "+2", false))
	h.sender.errOf[10] = ErrPushEndpointNotAllowed

	h.d.NotifyDirect("+2", "+1", directMsg("hola"))
	h.d.Close()

	assert.Equal(t, []uint{10}, h.repo.deleted, "un endpoint fuera de la allowlist nunca va a funcionar")
	assert.Empty(t, h.repo.marked)
}

func TestPushNotifier_OtherErrorsAreNotRetriedNorDeleted(t *testing.T) {
	h := newPushHarness(t, dispatchPushCfg, pushTarget(10, "+2", false))
	h.sender.errOf[10] = errors.New("servicio de push respondió 500")

	h.d.NotifyDirect("+2", "+1", directMsg("hola"))
	h.d.Close()

	assert.Equal(t, []uint{10}, h.sender.sentIDs(), "un solo intento")
	assert.Empty(t, h.repo.deleted)
	assert.Empty(t, h.repo.marked)
}

func TestPushNotifier_DirectMediaLabelAndTruncation(t *testing.T) {
	h := newPushHarness(t, dispatchPushCfg, pushTarget(10, "+2", false))
	msg := directMsg("")
	msg.MediaType = "audio"

	h.d.NotifyDirect("+2", "+1", msg)
	long := directMsg(strings.Repeat("x", 300))
	h.d.NotifyDirect("+2", "+1", long)
	h.d.Close()

	require.Len(t, h.sender.sent, 2)
	bodies := []string{h.sender.sent[0].payload["body"].(string), h.sender.sent[1].payload["body"].(string)}
	assert.Contains(t, bodies, "🎵 Audio")
	assert.Contains(t, bodies, strings.Repeat("x", 100)+"…")
}

func TestPushNotifier_PreviewOffGlobal(t *testing.T) {
	cfg := dispatchPushCfg
	cfg.Preview = false
	h := newPushHarness(t, cfg, pushTarget(10, "+2", false))

	h.d.NotifyDirect("+2", "+1", directMsg("secreto"))
	h.d.Close()

	require.Len(t, h.sender.sent, 1)
	assert.Equal(t, "Nuevo mensaje", h.sender.sent[0].payload["body"])
	assert.Equal(t, "ana", h.sender.sent[0].payload["title"])
}

func TestPushNotifier_PreviewOffPerUser(t *testing.T) {
	h := newPushHarness(t, dispatchPushCfg, pushTarget(20, "+2", true), pushTarget(30, "+3", false))

	h.d.NotifyGroup(7, "+1", groupMsg("secreto"), func(string) bool { return false })
	h.d.Close()

	bodies := map[uint]string{}
	for _, s := range h.sender.sent {
		bodies[s.sub.ID] = s.payload["body"].(string)
	}
	assert.Equal(t, map[uint]string{20: "Nuevo mensaje", 30: "ana: secreto"}, bodies)
}

func TestPushNotifier_DirectSkipsSystemAndSelf(t *testing.T) {
	h := newPushHarness(t, dispatchPushCfg, pushTarget(10, "+2", false), pushTarget(11, "+1", false))
	sys := directMsg("86400")
	sys.Kind = "system"

	h.d.NotifyDirect("+2", "+1", sys)
	h.d.NotifyDirect("+1", "+1", directMsg("nota para mí"))
	h.d.Close()

	assert.Empty(t, h.sender.sent)
	assert.Empty(t, h.repo.asked)
}

func TestPushNotifier_DirectUnknownUsernameFallsBackToTelephon(t *testing.T) {
	h := newPushHarness(t, dispatchPushCfg, pushTarget(10, "+2", false))
	msg := directMsg("hola")
	msg.SenderTelephon = "+9"

	h.d.NotifyDirect("+2", "+9", msg)
	h.d.Close()

	require.Len(t, h.sender.sent, 1)
	assert.Equal(t, "+9", h.sender.sent[0].payload["title"])
}

// ─────────────────────────────────────────────────────────────────────────────
// Grupos
// ─────────────────────────────────────────────────────────────────────────────

func TestPushNotifier_GroupExcludesSenderAndOnlineMembers(t *testing.T) {
	h := newPushHarness(t, dispatchPushCfg,
		pushTarget(1, "+1", false), pushTarget(2, "+2", false), pushTarget(3, "+3", false), pushTarget(4, "+4", false))
	online := map[string]bool{"+1": true, "+3": true}

	h.d.NotifyGroup(7, "+1", groupMsg("hola"), func(tel string) bool { return online[tel] })
	h.d.Close()

	assert.Equal(t, [][]string{{"+2", "+4"}}, h.repo.asked)
	assert.Equal(t, []uint{2, 4}, h.sender.sentIDs())
	p := h.sender.sent[0].payload
	assert.Equal(t, "group", p["kind"])
	assert.Equal(t, "Familia", p["title"])
	assert.Equal(t, "ana: hola", p["body"])
	assert.Equal(t, "group:7", p["tag"])
	assert.EqualValues(t, 7, p["groupID"])
	assert.NotContains(t, p, "telephon")
}

func TestPushNotifier_GroupAllOnlineSkipsQuery(t *testing.T) {
	h := newPushHarness(t, dispatchPushCfg, pushTarget(2, "+2", false))

	h.d.NotifyGroup(7, "+1", groupMsg("hola"), func(string) bool { return true })
	h.d.Close()

	assert.Empty(t, h.repo.asked)
	assert.Empty(t, h.sender.sent)
}

func TestPushNotifier_GroupSkipsSystemMessages(t *testing.T) {
	h := newPushHarness(t, dispatchPushCfg, pushTarget(2, "+2", false))
	msg := groupMsg("")
	msg.Kind = models.GroupMessageKindSystem

	h.d.NotifyGroup(7, "+1", msg, nil)
	h.d.Close()

	assert.Empty(t, h.sender.sent)
}

func TestPushNotifier_GroupNilIsOnlineTreatsEveryoneOffline(t *testing.T) {
	h := newPushHarness(t, dispatchPushCfg, pushTarget(2, "+2", false), pushTarget(3, "+3", false))

	h.d.NotifyGroup(7, "+1", groupMsg("hola"), nil)
	h.d.Close()

	assert.Equal(t, []uint{2, 3}, h.sender.sentIDs())
}

// ─────────────────────────────────────────────────────────────────────────────
// Configuración, cola y ciclo de vida
// ─────────────────────────────────────────────────────────────────────────────

func TestNewPushNotifier_DisabledConfigIsNoop(t *testing.T) {
	repo := &fakePushDispatchRepo{targets: []models.PushTarget{pushTarget(10, "+2", false)}}
	sender := &fakePushSender{}
	n := NewPushNotifier(config.PushConfig{Enabled: false}, PushDispatcherDeps{Repo: repo, Users: &fakePushDirectory{}, Groups: &fakePushDirectory{}, Sender: sender})

	assert.IsType(t, NoopPushNotifier{}, n)
	n.NotifyDirect("+2", "+1", directMsg("hola"))
	n.NotifyGroup(7, "+1", groupMsg("hola"), nil)
	assert.Empty(t, repo.asked)
	assert.Empty(t, sender.sent)
}

func TestNewPushNotifier_MissingDepsIsNoop(t *testing.T) {
	n := NewPushNotifier(dispatchPushCfg, PushDispatcherDeps{})
	assert.IsType(t, NoopPushNotifier{}, n)
	assert.NotPanics(t, func() {
		n.NotifyDirect("+2", "+1", directMsg("hola"))
		n.NotifyGroup(7, "+1", groupMsg("hola"), nil)
	})
}

func TestNewPushNotifier_EnabledReturnsDispatcher(t *testing.T) {
	n := NewPushNotifier(dispatchPushCfg, PushDispatcherDeps{Repo: &fakePushDispatchRepo{}, Users: &fakePushDirectory{}, Groups: &fakePushDirectory{}, Sender: &fakePushSender{}, Policy: newFakePushPolicy()})
	d, ok := n.(*PushDispatcher)
	require.True(t, ok)
	d.Close()
}

// Sin la política de silencios/bloqueos el despacho real no arranca: se
// notificaría a chats silenciados y a remitentes bloqueados.
func TestNewPushNotifier_MissingPolicyIsNoop(t *testing.T) {
	n := NewPushNotifier(dispatchPushCfg, PushDispatcherDeps{Repo: &fakePushDispatchRepo{}, Users: &fakePushDirectory{}, Groups: &fakePushDirectory{}, Sender: &fakePushSender{}})
	assert.IsType(t, NoopPushNotifier{}, n)
}

func TestPushDispatcher_DropsWhenQueueFull(t *testing.T) {
	repo := &fakePushDispatchRepo{targets: []models.PushTarget{pushTarget(10, "+2", false)}}
	sender := &fakePushSender{}
	// Sin workers: la cola (1) se llena con el primer trabajo.
	d := newPushDispatcher(dispatchPushCfg, PushDispatcherDeps{Repo: repo, Users: &fakePushDirectory{}, Groups: &fakePushDirectory{}, Sender: sender}, 0, 1)

	d.NotifyDirect("+2", "+1", directMsg("uno"))
	d.NotifyDirect("+2", "+1", directMsg("dos"))
	d.Close()

	assert.EqualValues(t, 1, d.Dropped())
}

func TestPushDispatcher_NotifyAfterCloseDoesNotPanic(t *testing.T) {
	h := newPushHarness(t, dispatchPushCfg, pushTarget(10, "+2", false))
	h.d.Close()
	h.d.Close()

	assert.NotPanics(t, func() { h.d.NotifyDirect("+2", "+1", directMsg("hola")) })
	assert.Empty(t, h.sender.sent)
}

func TestPushDispatcher_JobHasDeadline(t *testing.T) {
	var deadline time.Time
	var ok bool
	sender := senderFunc(func(ctx context.Context) {
		deadline, ok = ctx.Deadline()
	})
	repo := &fakePushDispatchRepo{targets: []models.PushTarget{pushTarget(10, "+2", false)}}
	d := NewPushDispatcher(dispatchPushCfg, PushDispatcherDeps{Repo: repo, Users: &fakePushDirectory{}, Groups: &fakePushDirectory{}, Sender: sender})
	start := time.Now()
	d.NotifyDirect("+2", "+1", directMsg("hola"))
	d.Close()

	require.True(t, ok)
	assert.WithinDuration(t, start.Add(pushSendTimeout), deadline, 2*time.Second)
}

// Un servicio de push lento no debe agotar el plazo del resto de envíos del
// mismo trabajo: cada suscripción tiene su propio contexto.
func TestPushDispatcher_SlowSendDoesNotStarveOthers(t *testing.T) {
	var mu sync.Mutex
	liveAtSend := map[uint]bool{}
	sender := subSenderFunc(func(ctx context.Context, sub models.PushSubscription) error {
		mu.Lock()
		liveAtSend[sub.ID] = ctx.Err() == nil
		mu.Unlock()
		if sub.ID == 10 {
			<-ctx.Done() // el primer servicio no responde nunca
			return ctx.Err()
		}
		return nil
	})
	repo := &fakePushDispatchRepo{targets: []models.PushTarget{pushTarget(10, "+2", false), pushTarget(11, "+2", false)}}
	d := newPushDispatcher(dispatchPushCfg, PushDispatcherDeps{Repo: repo, Users: &fakePushDirectory{}, Groups: &fakePushDirectory{}, Sender: sender}, 1, 1)
	d.jobTimeout = 50 * time.Millisecond
	d.sendTimeout = 50 * time.Millisecond

	d.NotifyDirect("+2", "+1", directMsg("hola"))
	d.Close()

	assert.Equal(t, map[uint]bool{10: true, 11: true}, liveAtSend)
	assert.Equal(t, []uint{11}, repo.marked)
}

type subSenderFunc func(ctx context.Context, sub models.PushSubscription) error

func (f subSenderFunc) Send(ctx context.Context, sub models.PushSubscription, _ []byte) error {
	return f(ctx, sub)
}

type senderFunc func(ctx context.Context)

func (f senderFunc) Send(ctx context.Context, _ models.PushSubscription, _ []byte) error {
	f(ctx)
	return nil
}

// Un servicio de push que no responde no puede colgar el apagado: CloseContext
// vuelve al vencer su plazo, cancela el envío en curso y descarta los
// trabajos encolados.
func TestPushDispatcher_CloseContextAbortsBlockedSendAtDeadline(t *testing.T) {
	started := make(chan struct{})
	sendErr := make(chan error, 1)
	var calls sync.Map
	sender := subSenderFunc(func(ctx context.Context, sub models.PushSubscription) error {
		calls.Store(sub.ID, true)
		if sub.ID == 10 {
			close(started)
			<-ctx.Done()
			sendErr <- ctx.Err()
			return ctx.Err()
		}
		return nil
	})
	repo := &fakePushDispatchRepo{targets: []models.PushTarget{pushTarget(10, "+2", false), pushTarget(11, "+3", false)}}
	d := newPushDispatcher(dispatchPushCfg, PushDispatcherDeps{Repo: repo, Users: &fakePushDirectory{}, Groups: &fakePushDirectory{}, Sender: sender}, 1, 4)
	d.sendTimeout = time.Hour // solo el cierre puede cortar el envío

	d.NotifyDirect("+2", "+1", directMsg("bloqueado"))
	<-started
	d.NotifyDirect("+3", "+1", directMsg("encolado"))

	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	begin := time.Now()
	err := d.CloseContext(ctx)
	elapsed := time.Since(begin)

	assert.ErrorIs(t, err, context.DeadlineExceeded)
	assert.Less(t, elapsed, 2*time.Second, "CloseContext respeta el plazo")
	select {
	case e := <-sendErr:
		assert.ErrorIs(t, e, context.Canceled, "el envío en curso se cancela")
	case <-time.After(2 * time.Second):
		t.Fatal("el envío bloqueado no vio cancelado su contexto")
	}
	// Tras cancelar, el worker descarta el trabajo encolado sin enviarlo.
	require.Eventually(t, func() bool { return d.workersDone() }, 2*time.Second, 5*time.Millisecond)
	_, sentQueued := calls.Load(uint(11))
	assert.False(t, sentQueued, "los trabajos encolados se descartan")
	assert.NoError(t, d.CloseContext(context.Background()), "idempotente")
}

// Con plazo suficiente, CloseContext drena los trabajos encolados.
func TestPushDispatcher_CloseContextDrainsQueuedJobs(t *testing.T) {
	release := make(chan struct{})
	var mu sync.Mutex
	var sent []uint
	sender := subSenderFunc(func(ctx context.Context, sub models.PushSubscription) error {
		<-release
		mu.Lock()
		sent = append(sent, sub.ID)
		mu.Unlock()
		return ctx.Err()
	})
	repo := &fakePushDispatchRepo{targets: []models.PushTarget{pushTarget(10, "+2", false), pushTarget(11, "+3", false), pushTarget(12, "+4", false)}}
	d := newPushDispatcher(dispatchPushCfg, PushDispatcherDeps{Repo: repo, Users: &fakePushDirectory{}, Groups: &fakePushDirectory{}, Sender: sender}, 1, 4)
	for _, tel := range []string{"+2", "+3", "+4"} {
		d.NotifyDirect(tel, "+1", directMsg("hola"))
	}
	go func() { time.Sleep(20 * time.Millisecond); close(release) }()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	require.NoError(t, d.CloseContext(ctx))

	mu.Lock()
	defer mu.Unlock()
	assert.Equal(t, []uint{10, 11, 12}, sent)
	assert.ElementsMatch(t, []uint{10, 11, 12}, repo.marked, "envíos completados con contexto vivo")
}

// Con el plazo ya vencido pero los workers ya terminados, el cierre no debe
// informar un timeout (select elige al azar entre canales listos).
func TestPushDispatcher_CloseContextIdleWithExpiredCtxReturnsNil(t *testing.T) {
	expired, cancel := context.WithCancel(context.Background())
	cancel()
	for i := 0; i < 50; i++ {
		d := newPushDispatcher(dispatchPushCfg, PushDispatcherDeps{Repo: &fakePushDispatchRepo{}, Users: &fakePushDirectory{}, Groups: &fakePushDirectory{}, Sender: &fakePushSender{}}, 1, 1)
		d.Close()
		require.NoError(t, d.CloseContext(expired))
	}
}
