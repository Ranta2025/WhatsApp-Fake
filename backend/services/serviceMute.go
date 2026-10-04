package services

import (
	"context"
	"errors"
	"fmt"
	"gorm/backend/models"
	"gorm/backend/schemas"
	"time"
)

// Sentinels del silencio por chat: el handler los distingue con errors.Is()
// para elegir el código HTTP.
var (
	// ErrMuteInvalidDuration: la duración no es "8h", "1w" ni "always" (400).
	ErrMuteInvalidDuration = errors.New("duración no válida: usa 8h, 1w o always")
	// ErrMuteChatNotFound: el chat 1:1 no existe (usuario desconocido o uno
	// mismo) o el tipo de chat no es válido (404).
	ErrMuteChatNotFound = errors.New("chat no encontrado")
)

// muteDurations traduce cada duración admitida a su vencimiento; 0 = para siempre.
var muteDurations = map[string]time.Duration{
	models.MuteDuration8h:     8 * time.Hour,
	models.MuteDuration1w:     7 * 24 * time.Hour,
	models.MuteDurationAlways: 0,
}

// MuteTarget identifica el chat a silenciar: el teléfono del otro usuario
// (Kind "direct") o el id del grupo (Kind "group").
type MuteTarget struct {
	Kind     string
	Telephon string
	GroupID  uint
}

// MuteServicer define las operaciones del silencio por chat.
type MuteServicer interface {
	// SetMute silencia el chat para el usuario durante duration ("8h", "1w" o
	// "always"). Volver a silenciar reemplaza el vencimiento anterior.
	SetMute(telephon string, target MuteTarget, duration string, ctx context.Context) (schemas.MuteResponse, error)
	// ClearMute quita el silencio. Es idempotente.
	ClearMute(telephon string, target MuteTarget, ctx context.Context) error
	// DecorateChats / DecorateContacts / DecorateGroups rellenan Muted y
	// MutedUntil de cada elemento del listado con UNA consulta (silencios
	// vigentes del usuario).
	DecorateChats(telephon string, chats []schemas.ChatGroup, ctx context.Context) error
	DecorateContacts(telephon string, contacts []models.ContactChat, ctx context.Context) error
	DecorateGroups(telephon string, groups []schemas.GroupResponse, ctx context.Context) error
}

// MuteRepoInterface es el subconjunto del repositorio que necesita ServiceMute.
type MuteRepoInterface interface {
	GetIdByTelephon(telephon string, ctx context.Context) (int, error)
	UpsertMute(m *models.ChatMute, ctx context.Context) error
	DeleteMute(userID uint, kind string, targetID uint, ctx context.Context) error
	ListActiveMutes(userID uint, now time.Time, ctx context.Context) ([]models.ActiveMute, error)
}

// MuteGroupMembership es la comprobación de membresía del repositorio de
// grupos (la misma que usa el resto del dominio de grupos).
type MuteGroupMembership interface {
	IsMember(groupID, userID uint, ctx context.Context) (bool, error)
}

type ServiceMute struct {
	repo   MuteRepoInterface
	groups MuteGroupMembership
	now    func() time.Time // reloj inyectable (nil = time.Now)
}

// InitServiceMute crea el servicio de silencios con su repositorio y la
// comprobación de membresía de grupos.
func InitServiceMute(repo MuteRepoInterface, groups MuteGroupMembership) MuteServicer {
	return &ServiceMute{repo: repo, groups: groups}
}

func (s *ServiceMute) clock() time.Time {
	if s.now != nil {
		return s.now()
	}
	return time.Now()
}

// resolve devuelve el id del usuario y el id del destino (usuario o grupo),
// exigiendo que el usuario sea parte del chat: en un 1:1 el otro usuario debe
// existir (y no ser él mismo); en un grupo debe ser miembro activo.
func (s *ServiceMute) resolve(telephon string, target MuteTarget, ctx context.Context) (uint, uint, error) {
	if target.Kind != models.ChatKindDirect && target.Kind != models.ChatKindGroup {
		return 0, 0, ErrMuteChatNotFound
	}
	userID, err := s.repo.GetIdByTelephon(telephon, ctx)
	if err != nil {
		return 0, 0, fmt.Errorf("resolver usuario: %w", err)
	}
	if target.Kind == models.ChatKindGroup {
		if target.GroupID == 0 {
			return 0, 0, ErrMuteChatNotFound
		}
		isMember, err := s.groups.IsMember(target.GroupID, uint(userID), ctx)
		if err != nil {
			return 0, 0, err
		}
		if !isMember {
			return 0, 0, ErrNotGroupMember
		}
		return uint(userID), target.GroupID, nil
	}
	if target.Telephon == "" || target.Telephon == telephon {
		return 0, 0, ErrMuteChatNotFound
	}
	peerID, err := s.repo.GetIdByTelephon(target.Telephon, ctx)
	if errors.Is(err, models.ErrUserNotFound) {
		return 0, 0, ErrMuteChatNotFound
	}
	if err != nil {
		return 0, 0, fmt.Errorf("resolver contacto: %w", err)
	}
	if peerID == userID {
		return 0, 0, ErrMuteChatNotFound
	}
	return uint(userID), uint(peerID), nil
}

func (s *ServiceMute) SetMute(telephon string, target MuteTarget, duration string, ctx context.Context) (schemas.MuteResponse, error) {
	d, ok := muteDurations[duration]
	if !ok {
		return schemas.MuteResponse{}, ErrMuteInvalidDuration
	}
	userID, targetID, err := s.resolve(telephon, target, ctx)
	if err != nil {
		return schemas.MuteResponse{}, err
	}
	var until *time.Time
	if d > 0 {
		// Al segundo y en UTC: la respuesta y el listado muestran lo mismo.
		t := s.clock().Add(d).UTC().Truncate(time.Second)
		until = &t
	}
	if err := s.repo.UpsertMute(&models.ChatMute{UserID: userID, ChatKind: target.Kind, TargetID: targetID, MutedUntil: until}, ctx); err != nil {
		return schemas.MuteResponse{}, err
	}
	return schemas.MuteResponse{Muted: true, MutedUntil: until}, nil
}

// ClearMute borra el silencio propio. En grupos no exige ser miembro: borrar
// la fila propia no expone nada y quien salió del grupo debe poder quitarlo.
func (s *ServiceMute) ClearMute(telephon string, target MuteTarget, ctx context.Context) error {
	if target.Kind == models.ChatKindGroup {
		if target.GroupID == 0 {
			return ErrMuteChatNotFound
		}
		userID, err := s.repo.GetIdByTelephon(telephon, ctx)
		if err != nil {
			return fmt.Errorf("resolver usuario: %w", err)
		}
		return s.repo.DeleteMute(uint(userID), target.Kind, target.GroupID, ctx)
	}
	userID, targetID, err := s.resolve(telephon, target, ctx)
	if err != nil {
		return err
	}
	return s.repo.DeleteMute(userID, target.Kind, targetID, ctx)
}

// muteIndex son los silencios vigentes del usuario indexados por chat. El
// valor nil significa "para siempre"; la ausencia, no silenciado.
type muteIndex struct {
	direct map[string]*time.Time
	group  map[uint]*time.Time
}

func (s *ServiceMute) activeMutes(telephon string, ctx context.Context) (muteIndex, error) {
	idx := muteIndex{direct: map[string]*time.Time{}, group: map[uint]*time.Time{}}
	userID, err := s.repo.GetIdByTelephon(telephon, ctx)
	if err != nil {
		return idx, err
	}
	rows, err := s.repo.ListActiveMutes(uint(userID), s.clock(), ctx)
	if err != nil {
		return idx, err
	}
	for _, r := range rows {
		// En UTC como la respuesta del PUT: el driver devuelve la zona local.
		if r.MutedUntil != nil {
			t := r.MutedUntil.UTC()
			r.MutedUntil = &t
		}
		switch r.ChatKind {
		case models.ChatKindDirect:
			if r.PeerTelephon != "" {
				idx.direct[r.PeerTelephon] = r.MutedUntil
			}
		case models.ChatKindGroup:
			idx.group[r.TargetID] = r.MutedUntil
		}
	}
	return idx, nil
}

func (s *ServiceMute) DecorateChats(telephon string, chats []schemas.ChatGroup, ctx context.Context) error {
	if len(chats) == 0 {
		return nil
	}
	idx, err := s.activeMutes(telephon, ctx)
	if err != nil {
		return err
	}
	for i := range chats {
		if until, ok := idx.direct[chats[i].ContactTelephon]; ok {
			chats[i].Muted, chats[i].MutedUntil = true, until
		}
	}
	return nil
}

func (s *ServiceMute) DecorateContacts(telephon string, contacts []models.ContactChat, ctx context.Context) error {
	if len(contacts) == 0 {
		return nil
	}
	idx, err := s.activeMutes(telephon, ctx)
	if err != nil {
		return err
	}
	for i := range contacts {
		if until, ok := idx.direct[contacts[i].Number]; ok {
			contacts[i].Muted, contacts[i].MutedUntil = true, until
		}
	}
	return nil
}

func (s *ServiceMute) DecorateGroups(telephon string, groups []schemas.GroupResponse, ctx context.Context) error {
	if len(groups) == 0 {
		return nil
	}
	idx, err := s.activeMutes(telephon, ctx)
	if err != nil {
		return err
	}
	for i := range groups {
		if until, ok := idx.group[groups[i].ID]; ok {
			groups[i].Muted, groups[i].MutedUntil = true, until
		}
	}
	return nil
}
