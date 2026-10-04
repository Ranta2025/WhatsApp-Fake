package services

import (
	"context"
	"errors"
	"log/slog"
	"sync"
	"sync/atomic"
	"time"

	"gorm/backend/config"
	"gorm/backend/models"
	"gorm/backend/schemas"
)

const (
	// pushWorkers es el número de goroutines que envían notificaciones.
	pushWorkers = 4
	// pushQueueSize es el máximo de trabajos pendientes; con la cola llena el
	// trabajo se descarta (se loggea) para no bloquear nunca al llamador.
	pushQueueSize = 256
	// pushJobTimeout acota cada trabajo completo (consultas + envíos).
	pushJobTimeout = 10 * time.Second
)

// PushNotifier dispara las notificaciones Web Push de un mensaje recién
// guardado. Ambos métodos vuelven de inmediato: el trabajo es asíncrono.
type PushNotifier interface {
	// NotifyDirect avisa al receptor de un mensaje 1:1. El llamador ya
	// comprobó que el receptor no está conectado.
	NotifyDirect(receiverTelephon string, senderTelephon string, msg schemas.Message)
	// NotifyGroup avisa a los miembros del grupo salvo el remitente y los que
	// isOnline marque como conectados (nil = todos desconectados).
	NotifyGroup(groupID uint, senderTelephon string, msg schemas.GroupMessageResponse, isOnline func(string) bool)
}

// NoopPushNotifier no hace nada: push deshabilitado o dependencias ausentes.
type NoopPushNotifier struct{}

func (NoopPushNotifier) NotifyDirect(string, string, schemas.Message) {}
func (NoopPushNotifier) NotifyGroup(uint, string, schemas.GroupMessageResponse, func(string) bool) {
}

// PushDispatchRepo es el subconjunto del repositorio de push que usa el despacho.
type PushDispatchRepo interface {
	ListPushTargetsByTelephons(telephons []string, ctx context.Context) ([]models.PushTarget, error)
	DeleteSubscriptionByID(id uint, ctx context.Context) error
	MarkSubscriptionSuccess(id uint, at time.Time, ctx context.Context) error
}

// PushUserLookup resuelve el username del remitente (título de los directos).
type PushUserLookup interface {
	GetUsernameByTelephon(telephon string, ctx context.Context) (string, error)
}

// PushGroupLookup resuelve los miembros y el nombre del grupo.
type PushGroupLookup interface {
	GetMemberTelephons(groupID uint, ctx context.Context) ([]string, error)
	GetGroupByID(groupID uint, ctx context.Context) (*models.Group, error)
}

// PushDispatcherDeps agrupa las dependencias del despacho.
type PushDispatcherDeps struct {
	Repo   PushDispatchRepo
	Users  PushUserLookup
	Groups PushGroupLookup
	Sender PushSender
}

func (d PushDispatcherDeps) complete() bool {
	return d.Repo != nil && d.Users != nil && d.Groups != nil && d.Sender != nil
}

// NewPushNotifier devuelve el despacho real, o un no-op si el push está
// deshabilitado o falta alguna dependencia.
func NewPushNotifier(cfg config.PushConfig, deps PushDispatcherDeps) PushNotifier {
	if !cfg.Enabled || !deps.complete() {
		return NoopPushNotifier{}
	}
	return NewPushDispatcher(cfg, deps)
}

// PushDispatcher es un pool acotado de workers (cola con buffer + N
// goroutines) que procesa los trabajos de notificación. Nunca bloquea al
// llamador: si la cola está llena el trabajo se descarta.
type PushDispatcher struct {
	cfg     config.PushConfig
	deps    PushDispatcherDeps
	jobs    chan func(context.Context)
	wg      sync.WaitGroup
	mu      sync.RWMutex // protege closed frente al envío a jobs
	closed  bool
	dropped atomic.Int64
	now     func() time.Time
}

// NewPushDispatcher arranca el pool con pushWorkers workers.
func NewPushDispatcher(cfg config.PushConfig, deps PushDispatcherDeps) *PushDispatcher {
	return newPushDispatcher(cfg, deps, pushWorkers, pushQueueSize)
}

func newPushDispatcher(cfg config.PushConfig, deps PushDispatcherDeps, workers, queueSize int) *PushDispatcher {
	d := &PushDispatcher{
		cfg:  cfg,
		deps: deps,
		jobs: make(chan func(context.Context), queueSize),
		now:  time.Now,
	}
	for i := 0; i < workers; i++ {
		d.wg.Add(1)
		go d.worker()
	}
	return d
}

func (d *PushDispatcher) worker() {
	defer d.wg.Done()
	for job := range d.jobs {
		d.run(job)
	}
}

// run ejecuta un trabajo con su propio timeout; un panic no tumba el worker.
func (d *PushDispatcher) run(job func(context.Context)) {
	ctx, cancel := context.WithTimeout(context.Background(), pushJobTimeout)
	defer cancel()
	defer func() {
		if r := recover(); r != nil {
			slog.Error("push: panic en el despacho", "panic", r)
		}
	}()
	job(ctx)
}

// Close deja de aceptar trabajos y espera a que los workers terminen los
// encolados. Es idempotente. Los tests lo usan para esperar sin sleeps.
func (d *PushDispatcher) Close() {
	d.mu.Lock()
	if d.closed {
		d.mu.Unlock()
		return
	}
	d.closed = true
	close(d.jobs)
	d.mu.Unlock()
	d.wg.Wait()
}

// Dropped devuelve cuántos trabajos se descartaron por cola llena.
func (d *PushDispatcher) Dropped() int64 { return d.dropped.Load() }

// enqueue encola sin bloquear. Tras Close o con la cola llena descarta.
func (d *PushDispatcher) enqueue(kind string, job func(context.Context)) {
	d.mu.RLock()
	defer d.mu.RUnlock()
	if d.closed {
		return
	}
	select {
	case d.jobs <- job:
	default:
		d.dropped.Add(1)
		slog.Warn("push: cola llena, notificación descartada", "kind", kind)
	}
}

func (d *PushDispatcher) NotifyDirect(receiverTelephon string, senderTelephon string, msg schemas.Message) {
	if !d.cfg.Enabled || receiverTelephon == "" || receiverTelephon == senderTelephon || msg.Kind == models.MessageKindSystem {
		return
	}
	d.enqueue(PushKindDirect, func(ctx context.Context) {
		username, err := d.deps.Users.GetUsernameByTelephon(senderTelephon, ctx)
		if err != nil {
			username = "" // el payload usa el teléfono como título
		}
		d.deliver(ctx, PushKindDirect, []string{receiverTelephon}, func(preview bool) ([]byte, error) {
			return BuildDirectPushPayload(msg, username, preview)
		})
	})
}

func (d *PushDispatcher) NotifyGroup(groupID uint, senderTelephon string, msg schemas.GroupMessageResponse, isOnline func(string) bool) {
	if !d.cfg.Enabled || groupID == 0 || msg.Kind == models.GroupMessageKindSystem {
		return
	}
	d.enqueue(PushKindGroup, func(ctx context.Context) {
		members, err := d.deps.Groups.GetMemberTelephons(groupID, ctx)
		if err != nil {
			slog.Error("push: error obteniendo miembros del grupo", "group_id", groupID, "err", err)
			return
		}
		recipients := make([]string, 0, len(members))
		for _, tel := range members {
			if tel == senderTelephon || (isOnline != nil && isOnline(tel)) {
				continue
			}
			recipients = append(recipients, tel)
		}
		if len(recipients) == 0 {
			return
		}
		groupName := ""
		if g, err := d.deps.Groups.GetGroupByID(groupID, ctx); err == nil && g != nil {
			groupName = g.Name
		}
		username := msg.SenderUsername
		if username == "" {
			username, _ = d.deps.Users.GetUsernameByTelephon(senderTelephon, ctx)
		}
		d.deliver(ctx, PushKindGroup, recipients, func(preview bool) ([]byte, error) {
			return BuildGroupPushPayload(msg, groupName, username, preview)
		})
	})
}

// deliver envía el payload a cada suscripción de los destinatarios. La
// preview efectiva es la global (PUSH_PREVIEW) y la del destinatario. Un
// 404/410 borra la suscripción; un éxito actualiza last_success_at; el resto
// de errores se loggea sin reintento.
func (d *PushDispatcher) deliver(ctx context.Context, kind string, recipients []string, build func(preview bool) ([]byte, error)) {
	targets, err := d.deps.Repo.ListPushTargetsByTelephons(recipients, ctx)
	if err != nil {
		slog.Error("push: error listando suscripciones", "kind", kind, "err", err)
		return
	}
	payloads := map[bool][]byte{}
	for _, t := range targets {
		preview := d.cfg.Preview && !t.PushPreviewDisabled
		payload, ok := payloads[preview]
		if !ok {
			if payload, err = build(preview); err != nil {
				slog.Error("push: error serializando el payload", "kind", kind, "err", err)
				return
			}
			payloads[preview] = payload
		}
		// Nunca se loggea el endpoint: es una URL con capacidad de envío.
		switch err := d.deps.Sender.Send(ctx, t.PushSubscription, payload); {
		case err == nil:
			if err := d.deps.Repo.MarkSubscriptionSuccess(t.ID, d.now(), ctx); err != nil {
				slog.Warn("push: error registrando el envío", "subscription_id", t.ID, "err", err)
			}
		case errors.Is(err, ErrPushGone):
			if err := d.deps.Repo.DeleteSubscriptionByID(t.ID, ctx); err != nil {
				slog.Warn("push: error borrando suscripción expirada", "subscription_id", t.ID, "err", err)
			}
		default:
			slog.Warn("push: envío fallido", "kind", kind, "subscription_id", t.ID, "err", err)
		}
	}
}
