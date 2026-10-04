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
	// pushJobTimeout acota las consultas de cada trabajo (destinatarios,
	// nombres, suscripciones); cada envío tiene su propio pushSendTimeout.
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

// PushPolicyLookup decide a quién NO notificar (silencios por chat y
// remitentes bloqueados). Ambas consultas son una sola sentencia por trabajo,
// nunca una por destinatario.
type PushPolicyLookup interface {
	// DirectPushState: silencio vigente en now del receptor sobre el 1:1 con
	// el remitente y estado de la fila de contacto del receptor hacia él.
	DirectPushState(receiverTelephon, senderTelephon string, now time.Time, ctx context.Context) (models.DirectPushState, error)
	// MutedTelephonsInGroup: de entre telephons, los que tienen el grupo
	// silenciado en now.
	MutedTelephonsInGroup(groupID uint, telephons []string, now time.Time, ctx context.Context) ([]string, error)
}

// PushDispatcherDeps agrupa las dependencias del despacho. NewPushNotifier
// exige todas, Policy incluida (repos.RepoMute); NewPushDispatcher acepta
// Policy nil (sin filtrar silencios ni bloqueos) para los tests.
type PushDispatcherDeps struct {
	Repo   PushDispatchRepo
	Users  PushUserLookup
	Groups PushGroupLookup
	Sender PushSender
	Policy PushPolicyLookup
}

func (d PushDispatcherDeps) complete() bool {
	return d.Repo != nil && d.Users != nil && d.Groups != nil && d.Sender != nil && d.Policy != nil
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
	cfg    config.PushConfig
	deps   PushDispatcherDeps
	jobs   chan func(context.Context)
	wg     sync.WaitGroup
	done   chan struct{} // se cierra cuando todos los workers terminaron
	mu     sync.RWMutex  // protege closed frente al envío a jobs
	closed bool
	// base es el contexto del que derivan todos los trabajos y envíos; se
	// cancela al cerrar para abortar los envíos en curso y descartar los
	// trabajos encolados que no dio tiempo a procesar.
	base       context.Context
	cancelBase context.CancelFunc
	dropped    atomic.Int64
	now        func() time.Time
	// jobTimeout acota las consultas del trabajo y sendTimeout cada envío;
	// son campos para poder acortarlos en los tests.
	jobTimeout  time.Duration
	sendTimeout time.Duration
}

// NewPushDispatcher arranca el pool con pushWorkers workers.
func NewPushDispatcher(cfg config.PushConfig, deps PushDispatcherDeps) *PushDispatcher {
	return newPushDispatcher(cfg, deps, pushWorkers, pushQueueSize)
}

func newPushDispatcher(cfg config.PushConfig, deps PushDispatcherDeps, workers, queueSize int) *PushDispatcher {
	base, cancelBase := context.WithCancel(context.Background())
	d := &PushDispatcher{
		cfg:        cfg,
		deps:       deps,
		jobs:       make(chan func(context.Context), queueSize),
		done:       make(chan struct{}),
		base:       base,
		cancelBase: cancelBase,
		now:        time.Now,

		jobTimeout:  pushJobTimeout,
		sendTimeout: pushSendTimeout,
	}
	for i := 0; i < workers; i++ {
		d.wg.Add(1)
		go d.worker()
	}
	go func() {
		d.wg.Wait()
		close(d.done)
	}()
	return d
}

func (d *PushDispatcher) worker() {
	defer d.wg.Done()
	for job := range d.jobs {
		if d.base.Err() != nil {
			continue // cierre vencido: se descartan los trabajos encolados
		}
		d.run(job)
	}
}

// run ejecuta un trabajo con su propio timeout (derivado del contexto base);
// un panic no tumba el worker.
func (d *PushDispatcher) run(job func(context.Context)) {
	ctx, cancel := context.WithTimeout(d.base, d.jobTimeout)
	defer cancel()
	defer func() {
		if r := recover(); r != nil {
			slog.Error("push: panic en el despacho", "panic", r)
		}
	}()
	job(ctx)
}

// CloseContext deja de aceptar trabajos y espera a que los workers terminen
// los encolados hasta que venza ctx. Si vence, cancela el contexto base (los
// envíos en curso se abortan y los trabajos aún encolados se descartan) y
// devuelve ctx.Err() sin esperar más. Es idempotente.
func (d *PushDispatcher) CloseContext(ctx context.Context) error {
	d.mu.Lock()
	if !d.closed {
		d.closed = true
		close(d.jobs)
	}
	d.mu.Unlock()
	select {
	case <-d.done:
		d.cancelBase()
		return nil
	case <-ctx.Done():
		// select elige al azar si ambos están listos: si los workers ya
		// terminaron no es un timeout.
		select {
		case <-d.done:
			d.cancelBase()
			return nil
		default:
		}
		d.cancelBase()
		return ctx.Err()
	}
}

// Close es CloseContext sin plazo: espera a drenar todos los trabajos
// encolados (cada envío sigue acotado por sendTimeout). Los tests lo usan
// para esperar sin sleeps; el apagado de la app usa CloseContext.
func (d *PushDispatcher) Close() {
	_ = d.CloseContext(context.Background())
}

// workersDone indica si todos los workers terminaron (para los tests).
func (d *PushDispatcher) workersDone() bool {
	select {
	case <-d.done:
		return true
	default:
		return false
	}
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
		trusted := true
		if d.deps.Policy != nil {
			state, err := d.deps.Policy.DirectPushState(receiverTelephon, senderTelephon, d.now(), ctx)
			if err != nil {
				// Sin poder comprobar silencio/bloqueo no se notifica.
				slog.Error("push: error comprobando silencio/bloqueo", "kind", PushKindDirect, "err", err)
				return
			}
			if state.Muted || state.ContactStatus == models.ContactStatusRejected {
				return // chat silenciado o remitente bloqueado por el receptor
			}
			trusted = state.ContactStatus == models.ContactStatusAccepted
		}
		if !trusted {
			// Anti spam/phishing: un remitente que el receptor no tiene como
			// contacto aceptado se notifica con el cuerpo genérico y su
			// teléfono como título (nunca el texto ni el username que él eligió).
			d.deliver(ctx, PushKindDirect, []string{receiverTelephon}, func(bool) ([]byte, error) {
				return BuildDirectPushPayload(msg, "", false)
			})
			return
		}
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
		if recipients = d.withoutGroupMuted(ctx, groupID, recipients); len(recipients) == 0 {
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

// withoutGroupMuted quita de recipients a los que tienen el grupo silenciado
// (una sola consulta). Si la consulta falla no notifica a nadie. El bloqueo
// de contactos no aplica a los grupos.
func (d *PushDispatcher) withoutGroupMuted(ctx context.Context, groupID uint, recipients []string) []string {
	if d.deps.Policy == nil || len(recipients) == 0 {
		return recipients
	}
	muted, err := d.deps.Policy.MutedTelephonsInGroup(groupID, recipients, d.now(), ctx)
	if err != nil {
		slog.Error("push: error comprobando silencios del grupo", "group_id", groupID, "err", err)
		return nil
	}
	if len(muted) == 0 {
		return recipients
	}
	skip := make(map[string]bool, len(muted))
	for _, tel := range muted {
		skip[tel] = true
	}
	out := recipients[:0]
	for _, tel := range recipients {
		if !skip[tel] {
			out = append(out, tel)
		}
	}
	return out
}

// deliver envía el payload a cada suscripción de los destinatarios. La
// preview efectiva es la global (PUSH_PREVIEW) y la del destinatario. Un
// error permanente (401/403/404/410 o endpoint fuera de la allowlist) borra
// la suscripción; un éxito actualiza last_success_at; el resto de errores se
// loggea sin reintento.
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
		d.sendOne(kind, t.PushSubscription, payload)
	}
}

// sendOne envía a una suscripción con su propio plazo (sendTimeout), derivado
// del contexto base del despacho y no del trabajo: un servicio de push lento
// no agota el plazo de los demás envíos, y el cierre (CloseContext) aborta el
// envío en curso. El borrado / last_success_at posterior
// usa el mismo contexto. Nunca se loggea el endpoint: es una URL con
// capacidad de envío.
func (d *PushDispatcher) sendOne(kind string, sub models.PushSubscription, payload []byte) {
	ctx, cancel := context.WithTimeout(d.base, d.sendTimeout)
	defer cancel()
	switch err := d.deps.Sender.Send(ctx, sub, payload); {
	case err == nil:
		if err := d.deps.Repo.MarkSubscriptionSuccess(sub.ID, d.now(), ctx); err != nil {
			slog.Warn("push: error registrando el envío", "subscription_id", sub.ID, "err", err)
		}
	case errors.Is(err, ErrPushGone), errors.Is(err, ErrPushEndpointNotAllowed):
		// Errores permanentes: reintentar nunca va a funcionar.
		if err := d.deps.Repo.DeleteSubscriptionByID(sub.ID, ctx); err != nil {
			slog.Warn("push: error borrando suscripción inválida", "subscription_id", sub.ID, "err", err)
		}
	default:
		slog.Warn("push: envío fallido", "kind", kind, "subscription_id", sub.ID, "err", err)
	}
}
