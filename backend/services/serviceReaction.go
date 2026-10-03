package services

import (
	"context"
	"gorm/backend/models"
	"sync"
	"time"
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
	UpsertReaction(kind string, messageID, userID uint, emoji string, ctx context.Context) error
	DeleteReaction(kind string, messageID, userID uint, ctx context.Context) error
	ListReactionUsers(kind string, messageID uint, ctx context.Context) ([]models.ReactionUsers, error)
}

// ReactionChange es el resultado de SetReaction: lo que el transporte necesita
// para el fan-out del evento `reaction`.
type ReactionChange struct {
	Kind        string
	MessageID   uint
	GroupID     uint // solo grupo
	UserID      uint // quien reaccionó
	Emoji       string
	Removed     bool
	AuthorID    uint // autor del mensaje
	OtherUserID uint // solo 1:1: el otro participante respecto a UserID
}

// ReactionService orquesta autorización, validación y persistencia de reacciones.
type ReactionService struct {
	repo ReactionRepoInterface
	now  func() time.Time

	mu    sync.Mutex
	calls map[uint][]time.Time
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

	if removed {
		err = s.repo.DeleteReaction(kind, messageID, userID, ctx)
	} else {
		err = s.repo.UpsertReaction(kind, messageID, userID, emoji, ctx)
	}
	if err != nil {
		return nil, err
	}

	change := &ReactionChange{
		Kind: kind, MessageID: messageID, UserID: userID,
		Emoji: emoji, Removed: removed,
		AuthorID: target.AuthorID, OtherUserID: target.OtherUserID,
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
