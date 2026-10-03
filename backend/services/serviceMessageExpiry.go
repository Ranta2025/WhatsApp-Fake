package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"sort"
	"time"

	"gorm/backend/models"
)

// MessageExpiryRepo es el acceso a datos del job de expiración (repos.RepoExpiry).
type MessageExpiryRepo interface {
	ExpireBatch(ctx context.Context, kind string, limit int, keyOf func(string) (string, bool)) ([]models.ExpiredMessage, error)
	CountExpired(ctx context.Context, kind string) (int64, error)
	DueMediaGC(ctx context.Context, limit int) ([]models.MediaGC, error)
	MediaKeyReferenced(ctx context.Context, key string) (bool, error)
	DeleteMediaGC(ctx context.Context, id uint) error
	RescheduleMediaGC(ctx context.Context, id uint, attempts int, next time.Time, lastErr string) error
	CountMediaGC(ctx context.Context) (int64, error)
}

// MediaRemover deriva object keys de URLs guardadas y borra objetos (ServiceMedia).
type MediaRemover interface {
	ObjectKeyFromURL(url string) (string, bool)
	RemoveObject(ctx context.Context, key string) error
}

// ExpiryNotifier entrega eventos WS (lo implementa el Hub).
type ExpiryNotifier interface {
	SendTo(telephon string, msg []byte)
	SendToGroup(groupID uint, senderTelephon string, msg []byte)
}

// ExpiryMetrics son los ganchos de métricas del job (metrics.Metrics).
type ExpiryMetrics interface {
	MessagesExpired(kind string, n int)
	MediaGCResult(result string)
	SetMediaGCPending(n int64)
}

const (
	// expiryBatchSize es el tamaño de lote de cada transacción de expiración.
	expiryBatchSize = 500
	// maxExpiryBatchesPerRun acota los lotes por tipo y pasada (50k mensajes):
	// lo que quede se procesa en la siguiente pasada.
	maxExpiryBatchesPerRun = 100
	// mediaGCBatchSize es cuántas filas de media_gc se procesan por pasada.
	mediaGCBatchSize = 100
	// maxMediaGCAttempts: al llegar a este número de intentos fallidos se
	// abandona el objeto (se loguea con nivel error y se cuenta como gave_up).
	maxMediaGCAttempts = 8
	// Backoff exponencial de reintentos: 1m * 2^attempts, con tope.
	mediaGCBaseBackoff = time.Minute
	maxMediaGCBackoff  = 6 * time.Hour

	// Etiquetas de resultado (alineadas con metrics.MediaGC*).
	mediaGCResultOK         = "ok"
	mediaGCResultFailed     = "failed"
	mediaGCResultGaveUp     = "gave_up"
	mediaGCResultReferenced = "skipped_referenced"
)

// expiryKinds son los tipos que se expiran, en orden.
var expiryKinds = []string{models.ReactionKindDirect, models.ReactionKindGroup}

// MessageExpiryService es el job de expiración de mensajes temporales: borra
// físicamente los vencidos (por lotes), avisa a los clientes con
// `messages_expired` y procesa la cola media_gc de objetos de MinIO.
type MessageExpiryService struct {
	repo      MessageExpiryRepo
	media     MediaRemover
	notifier  ExpiryNotifier
	metrics   ExpiryMetrics
	now       func() time.Time
	dryRun    bool
	batchSize int
}

// NewMessageExpiryService construye el job. Con dryRun solo cuenta y loguea los
// vencidos: no borra mensajes, no notifica y no toca la cola media_gc.
func NewMessageExpiryService(repo MessageExpiryRepo, media MediaRemover, notifier ExpiryNotifier, m ExpiryMetrics, dryRun bool) *MessageExpiryService {
	return &MessageExpiryService{
		repo:      repo,
		media:     media,
		notifier:  notifier,
		metrics:   m,
		now:       time.Now,
		dryRun:    dryRun,
		batchSize: expiryBatchSize,
	}
}

// RunOnce ejecuta una pasada completa: expira 1:1, expira grupos (notificando
// tras cada lote confirmado) y procesa la cola media_gc. Un fallo de una etapa
// no impide las demás; los errores se devuelven juntos.
func (s *MessageExpiryService) RunOnce(ctx context.Context) error {
	if s.dryRun {
		return s.dryRunCount(ctx)
	}
	var errs []error
	for _, kind := range expiryKinds {
		if err := s.expireKind(ctx, kind); err != nil {
			errs = append(errs, fmt.Errorf("expirando mensajes %s: %w", kind, err))
		}
	}
	if err := s.processMediaGC(ctx); err != nil {
		errs = append(errs, fmt.Errorf("procesando media_gc: %w", err))
	}
	return errors.Join(errs...)
}

// dryRunCount solo cuenta los vencidos de cada tipo y los loguea.
func (s *MessageExpiryService) dryRunCount(ctx context.Context) error {
	var errs []error
	for _, kind := range expiryKinds {
		n, err := s.repo.CountExpired(ctx, kind)
		if err != nil {
			errs = append(errs, err)
			continue
		}
		if n > 0 {
			slog.Info("message-expiry dry-run: mensajes vencidos (no se borra nada)", "kind", kind, "count", n)
		}
	}
	return errors.Join(errs...)
}

// expireKind procesa lotes hasta que uno viene con menos filas que el límite
// (o se alcanza el tope de lotes por pasada).
func (s *MessageExpiryService) expireKind(ctx context.Context, kind string) error {
	for i := 0; i < maxExpiryBatchesPerRun; i++ {
		if err := ctx.Err(); err != nil {
			return err
		}
		rows, err := s.repo.ExpireBatch(ctx, kind, s.batchSize, s.media.ObjectKeyFromURL)
		if err != nil {
			return err
		}
		if len(rows) > 0 {
			s.metrics.MessagesExpired(kind, len(rows))
			slog.Info("message-expiry: mensajes borrados", "kind", kind, "count", len(rows))
			s.notify(kind, rows)
		}
		if len(rows) < s.batchSize {
			return nil
		}
	}
	return nil
}

// messagesExpiredEvent es el payload del evento WS `messages_expired`.
type messagesExpiredEvent struct {
	Kind       string      `json:"kind"`
	Key        interface{} `json:"key"`
	MessageIDs []uint      `json:"messageIDs"`
}

func marshalExpired(ev messagesExpiredEvent) ([]byte, error) {
	return json.Marshal(map[string]interface{}{"type": "messages_expired", "payload": ev})
}

// notify avisa a los clientes del lote ya confirmado.
//   - 1:1: a cada participante por separado (Hub.SendTo), con key = el OTRO
//     participante (es como el cliente indexa sus chats).
//   - Grupos: un evento por grupo a la room con sender vacío (nadie excluido),
//     el mismo canal por el que llega `group_chat` a los miembros conectados.
func (s *MessageExpiryService) notify(kind string, rows []models.ExpiredMessage) {
	if kind == models.ReactionKindGroup {
		byGroup := map[uint][]uint{}
		var order []uint
		for _, r := range rows {
			if _, ok := byGroup[r.GroupID]; !ok {
				order = append(order, r.GroupID)
			}
			byGroup[r.GroupID] = append(byGroup[r.GroupID], r.ID)
		}
		for _, gid := range order {
			msg, err := marshalExpired(messagesExpiredEvent{Kind: kind, Key: gid, MessageIDs: byGroup[gid]})
			if err == nil {
				s.notifier.SendToGroup(gid, "", msg)
			}
		}
		return
	}

	type target struct{ to, key string }
	byTarget := map[target][]uint{}
	var order []target
	add := func(to, key string, id uint) {
		if to == "" || key == "" {
			return
		}
		t := target{to, key}
		if _, ok := byTarget[t]; !ok {
			order = append(order, t)
		}
		ids := byTarget[t]
		if len(ids) > 0 && ids[len(ids)-1] == id {
			return // chat con uno mismo: mismo destino dos veces
		}
		byTarget[t] = append(ids, id)
	}
	for _, r := range rows {
		add(r.SenderTelephon, r.ReceptorTelephon, r.ID)
		add(r.ReceptorTelephon, r.SenderTelephon, r.ID)
	}
	sort.SliceStable(order, func(i, j int) bool {
		if order[i].to != order[j].to {
			return order[i].to < order[j].to
		}
		return order[i].key < order[j].key
	})
	for _, t := range order {
		msg, err := marshalExpired(messagesExpiredEvent{Kind: kind, Key: t.key, MessageIDs: byTarget[t]})
		if err == nil {
			s.notifier.SendTo(t.to, msg)
		}
	}
}

// mediaGCBackoff es la espera antes del siguiente intento tras attempts fallos.
func mediaGCBackoff(attempts int) time.Duration {
	if attempts >= 30 {
		return maxMediaGCBackoff
	}
	d := mediaGCBaseBackoff << uint(attempts)
	if d <= 0 || d > maxMediaGCBackoff {
		return maxMediaGCBackoff
	}
	return d
}

// processMediaGC procesa las filas de la cola cuyo reintento ya toca. Antes de
// cada borrado se vuelve a comprobar que ninguna fila viva referencia el objeto.
func (s *MessageExpiryService) processMediaGC(ctx context.Context) error {
	due, err := s.repo.DueMediaGC(ctx, mediaGCBatchSize)
	if err != nil {
		return err
	}
	var errs []error
	for _, row := range due {
		if err := ctx.Err(); err != nil {
			errs = append(errs, err)
			break
		}
		if err := s.collectMedia(ctx, row); err != nil {
			errs = append(errs, err)
		}
	}
	if pending, err := s.repo.CountMediaGC(ctx); err == nil {
		s.metrics.SetMediaGCPending(pending)
	} else {
		errs = append(errs, err)
	}
	return errors.Join(errs...)
}

// collectMedia intenta borrar un objeto de la cola.
func (s *MessageExpiryService) collectMedia(ctx context.Context, row models.MediaGC) error {
	referenced, err := s.repo.MediaKeyReferenced(ctx, row.ObjectKey)
	if err != nil {
		return err // se reintenta en la próxima pasada, sin gastar un intento
	}
	if referenced {
		// Otro mensaje/estado/avatar vivo usa el objeto: no se borra. Si esa
		// fila expira más adelante, su propia expiración lo vuelve a encolar.
		s.metrics.MediaGCResult(mediaGCResultReferenced)
		return s.repo.DeleteMediaGC(ctx, row.ID)
	}

	removeErr := s.media.RemoveObject(ctx, row.ObjectKey)
	if removeErr == nil || errors.Is(removeErr, ErrMediaObjectMissing) {
		s.metrics.MediaGCResult(mediaGCResultOK)
		return s.repo.DeleteMediaGC(ctx, row.ID)
	}

	attempts := row.Attempts + 1
	if attempts >= maxMediaGCAttempts {
		slog.Error("media-gc: se abandona el borrado del objeto tras el máximo de intentos",
			"object_key", row.ObjectKey, "attempts", attempts, "err", removeErr)
		s.metrics.MediaGCResult(mediaGCResultGaveUp)
		return s.repo.DeleteMediaGC(ctx, row.ID)
	}
	slog.Warn("media-gc: fallo al borrar el objeto, se reintentará",
		"object_key", row.ObjectKey, "attempts", attempts, "err", removeErr)
	s.metrics.MediaGCResult(mediaGCResultFailed)
	return s.repo.RescheduleMediaGC(ctx, row.ID, attempts, s.now().Add(mediaGCBackoff(attempts)), removeErr.Error())
}
