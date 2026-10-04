package services

import (
	"context"
	"errors"
	"gorm/backend/models"
	"gorm/backend/schemas"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

// Errores tipados que los transportes (REST/WS) traducen a códigos HTTP/WS.
// ErrNotGroupMember vive junto a los permisos de grupo; ErrGroupMessageNotFound
// en groupReceipts.go; models.ErrMessageNotFound es el 404 de los chats 1:1.
var (
	ErrInvalidReactionKind = models.ErrInvalidReactionKind
	ErrReactionRateLimited = models.ErrReactionRateLimited
)

// Límite por usuario: reactionRateMax reacciones por reactionRateWindow. No
// existe un limitador a nivel de WS (middleware/rateLimit.go es HTTP por IP).
const (
	reactionRateMax    = 10
	reactionRateWindow = time.Second
)

// ReactionRepoInterface es lo que ReactionService necesita del repositorio.
type ReactionRepoInterface interface {
	DirectMessageTarget(messageID, userID uint, ctx context.Context) (*models.ReactionTarget, error)
	GroupMessageTarget(groupID, messageID uint, ctx context.Context) (*models.ReactionTarget, error)
	IsGroupMember(groupID, userID uint, ctx context.Context) (bool, error)
	// UpsertReaction/DeleteReaction informan si la fila cambió (insertada,
	// reemplazada o borrada); un no-op (mismo emoji, nada que borrar) devuelve false.
	// También devuelven el emoji anterior del usuario ("" si no tenía).
	UpsertReaction(kind string, messageID, userID uint, emoji string, ctx context.Context) (previous string, changed bool, err error)
	DeleteReaction(kind string, messageID, userID uint, ctx context.Context) (previous string, changed bool, err error)
	ActorByTelephon(telephon string, ctx context.Context) (*models.ReactionActor, error)
	ListReactionUsers(kind string, messageID uint, ctx context.Context) ([]models.ReactionUsers, error)
}

// ReactionServicer es lo que consumen los transportes (WS y REST); trabaja con
// teléfonos, que es lo que conocen.
type ReactionServicer interface {
	React(telephon, kind string, messageID, groupID uint, emoji string, ctx context.Context) (*ReactionChange, error)
	ListReactionsFor(telephon, kind string, messageID, groupID uint, ctx context.Context) ([]models.ReactionUsers, error)
}

// ReactionChange es el resultado de SetReaction: lo que el transporte necesita
// para el fan-out del evento `reaction`.
type ReactionChange struct {
	Kind      string
	MessageID uint
	GroupID   uint // solo grupo
	UserID    uint // quien reaccionó
	Emoji     string
	// PreviousEmoji es el emoji que el usuario tenía antes ("" si ninguno).
	PreviousEmoji string
	Removed       bool
	AuthorID      uint // autor del mensaje
	OtherUserID   uint // solo 1:1: el otro participante respecto a UserID
	// Changed es false cuando la operación no modificó nada (mismo emoji, quitar
	// una reacción inexistente): el transporte no debe difundirla.
	Changed bool

	// Rellenados por React (transporte por teléfono).
	ActorTelephon  string
	ActorUsername  string
	AuthorTelephon string
	OtherTelephon  string // solo 1:1
	Preview        string
}

// Event construye el payload del evento WS `reaction`.
func (c *ReactionChange) Event() schemas.ReactionEvent {
	return schemas.ReactionEvent{
		Kind: c.Kind, MessageID: c.MessageID, GroupID: c.GroupID,
		Telephon: c.ActorTelephon, Username: c.ActorUsername, Emoji: c.Emoji, PreviousEmoji: c.PreviousEmoji,
		AuthorTelephon: c.AuthorTelephon, Preview: c.Preview,
	}
}

// ReactionService orquesta autorización, validación y persistencia de reacciones.
type ReactionService struct {
	repo ReactionRepoInterface
	now  func() time.Time

	mu        sync.Mutex
	calls     map[uint][]time.Time
	lastSweep time.Time
}

func NewReactionService(repo ReactionRepoInterface) *ReactionService {
	return &ReactionService{repo: repo, now: time.Now, calls: make(map[uint][]time.Time)}
}

// allow aplica una ventana deslizante por usuario.
func (s *ReactionService) allow(userID uint) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := s.now()
	cutoff := now.Add(-reactionRateWindow)
	s.sweepLocked(cutoff)
	recent := s.calls[userID][:0]
	for _, t := range s.calls[userID] {
		if t.After(cutoff) {
			recent = append(recent, t)
		}
	}
	if len(recent) >= reactionRateMax {
		s.calls[userID] = recent
		return false
	}
	s.calls[userID] = append(recent, now)
	return true
}

// sweepLocked elimina las claves de usuarios sin actividad dentro de la ventana
// (como mucho una pasada por ventana) para que el mapa no crezca sin límite.
func (s *ReactionService) sweepLocked(cutoff time.Time) {
	if !s.lastSweep.Before(cutoff) {
		return
	}
	s.lastSweep = s.now()
	for id, times := range s.calls {
		if len(times) == 0 || !times[len(times)-1].After(cutoff) {
			delete(s.calls, id)
		}
	}
}

// authorize comprueba que userID pueda ver/reaccionar al mensaje y devuelve su
// objetivo. 1:1 invisible o ajeno -> ErrMessageNotFound; grupo: no miembro ->
// ErrNotGroupMember y mensaje ausente/borrado/de sistema/de otro grupo ->
// ErrGroupMessageNotFound.
func (s *ReactionService) authorize(userID uint, kind string, messageID, groupID uint, ctx context.Context) (*models.ReactionTarget, error) {
	switch kind {
	case models.ReactionKindDirect:
		return s.repo.DirectMessageTarget(messageID, userID, ctx)
	case models.ReactionKindGroup:
		ok, err := s.repo.IsGroupMember(groupID, userID, ctx)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, ErrNotGroupMember
		}
		return s.repo.GroupMessageTarget(groupID, messageID, ctx)
	default:
		return nil, ErrInvalidReactionKind
	}
}

// SetReaction fija el estado deseado: emoji no vacío = crear/reemplazar la
// reacción del usuario; vacío = quitarla.
func (s *ReactionService) SetReaction(userID uint, kind string, messageID, groupID uint, emoji string, ctx context.Context) (*ReactionChange, error) {
	if kind != models.ReactionKindDirect && kind != models.ReactionKindGroup {
		return nil, ErrInvalidReactionKind
	}
	removed := emoji == ""
	if !removed {
		norm, err := NormalizeReactionEmoji(emoji)
		if err != nil {
			return nil, err
		}
		emoji = norm
	}
	if !s.allow(userID) {
		return nil, ErrReactionRateLimited
	}

	target, err := s.authorize(userID, kind, messageID, groupID, ctx)
	if err != nil {
		return nil, err
	}

	var changed bool
	var previous string
	if removed {
		previous, changed, err = s.repo.DeleteReaction(kind, messageID, userID, ctx)
	} else {
		previous, changed, err = s.repo.UpsertReaction(kind, messageID, userID, emoji, ctx)
	}
	if err != nil {
		return nil, err
	}

	change := &ReactionChange{
		Kind: kind, MessageID: messageID, UserID: userID,
		Emoji: emoji, PreviousEmoji: previous, Removed: removed, Changed: changed,
		AuthorID: target.AuthorID, OtherUserID: target.OtherUserID,
		AuthorTelephon: target.AuthorTelephon, OtherTelephon: target.OtherTelephon,
		Preview: reactionPreview(target.Text, target.MediaType),
	}
	if kind == models.ReactionKindGroup {
		change.GroupID = target.GroupID
	}
	return change, nil
}

// ListReactions devuelve quién reaccionó con qué; cualquier participante o
// miembro con acceso al mensaje puede leerlo.
func (s *ReactionService) ListReactions(userID uint, kind string, messageID, groupID uint, ctx context.Context) ([]models.ReactionUsers, error) {
	if _, err := s.authorize(userID, kind, messageID, groupID, ctx); err != nil {
		return nil, err
	}
	out, err := s.repo.ListReactionUsers(kind, messageID, ctx)
	if err != nil {
		return nil, err
	}
	if out == nil {
		out = []models.ReactionUsers{}
	}
	return out, nil
}

// React es SetReaction para los transportes: resuelve al actor por teléfono y
// completa los campos del evento (teléfonos, nombre y preview).
func (s *ReactionService) React(telephon, kind string, messageID, groupID uint, emoji string, ctx context.Context) (*ReactionChange, error) {
	actor, err := s.repo.ActorByTelephon(telephon, ctx)
	if err != nil {
		return nil, err
	}
	change, err := s.SetReaction(actor.ID, kind, messageID, groupID, emoji, ctx)
	if err != nil {
		return nil, err
	}
	change.ActorTelephon, change.ActorUsername = telephon, actor.Username
	return change, nil
}

// ListReactionsFor es ListReactions identificando al usuario por su teléfono.
func (s *ReactionService) ListReactionsFor(telephon, kind string, messageID, groupID uint, ctx context.Context) ([]models.ReactionUsers, error) {
	actor, err := s.repo.ActorByTelephon(telephon, ctx)
	if err != nil {
		return nil, err
	}
	return s.ListReactions(actor.ID, kind, messageID, groupID, ctx)
}

const reactionPreviewMaxRunes = 60

// reactionPreview resume el mensaje reaccionado en una línea corta: su texto
// (espacios colapsados, ≤60 runas) o, sin texto, un marcador según el tipo de media.
func reactionPreview(text, mediaType string) string {
	text = strings.Join(strings.Fields(text), " ")
	if text == "" {
		switch mediaType {
		case "":
			return ""
		case "image":
			return "📷 Photo"
		case "video":
			return "🎥 Video"
		case "audio":
			return "🎤 Audio"
		case "sticker":
			return "Sticker"
		default:
			return "📎 File"
		}
	}
	if utf8.RuneCountInString(text) <= reactionPreviewMaxRunes {
		return text
	}
	return string([]rune(text)[:reactionPreviewMaxRunes-1]) + "…"
}

// ReactionErrorStatus traduce un error de reacciones al código HTTP equivalente
// (también usado por el error WS): 400 petición/emoji/kind inválidos, 403 no
// miembro, 404 mensaje inexistente o invisible, 429 límite, 500 el resto.
func ReactionErrorStatus(err error) int {
	switch {
	case errors.Is(err, ErrInvalidReactionEmoji), errors.Is(err, ErrInvalidReactionKind):
		return 400
	case errors.Is(err, ErrNotGroupMember):
		return 403
	case errors.Is(err, models.ErrMessageNotFound), errors.Is(err, ErrGroupMessageNotFound), errors.Is(err, models.ErrUserNotFound):
		return 404
	case errors.Is(err, ErrReactionRateLimited):
		return 429
	default:
		return 500
	}
}
