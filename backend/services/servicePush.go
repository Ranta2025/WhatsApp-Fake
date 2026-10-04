package services

import (
	"context"
	"errors"
	"fmt"
	"gorm/backend/config"
	"gorm/backend/models"
	"gorm/backend/schemas"
	"gorm/backend/utils"
)

// MaxPushSubscriptionsPerUser es el máximo de navegadores/dispositivos con push
// por usuario. Re-suscribir un endpoint propio no cuenta como uno nuevo.
const MaxPushSubscriptionsPerUser = 10

// maxPushUserAgentLen es el tamaño de la columna user_agent (size:300).
const maxPushUserAgentLen = 300

// Sentinels del feature de Web Push: el handler los distingue con errors.Is()
// para elegir el código HTTP.
var (
	// ErrPushDisabled: el servidor no tiene claves VAPID configuradas (404).
	ErrPushDisabled = errors.New("push deshabilitado")
	// ErrPushLimit: el usuario ya tiene MaxPushSubscriptionsPerUser suscripciones (409).
	ErrPushLimit = errors.New("límite de suscripciones push alcanzado")
	// ErrPushInvalid: endpoint fuera de la allowlist o claves inválidas (400).
	ErrPushInvalid = errors.New("suscripción push inválida")
)

// PushServicer define las operaciones REST del feature de Web Push.
type PushServicer interface {
	// Config devuelve si el push está habilitado, la clave pública VAPID y la
	// preferencia efectiva de preview del usuario.
	Config(telephon string, ctx context.Context) (schemas.PushConfigResponse, error)
	// Subscribe guarda (o reasigna) la suscripción del navegador. created=false
	// si el endpoint ya era del usuario.
	Subscribe(telephon string, input models.PushSubscriptionInput, userAgent string, ctx context.Context) (created bool, err error)
	// Unsubscribe borra la suscripción del usuario con ese endpoint. Es
	// idempotente y funciona aunque el push esté deshabilitado (limpieza).
	Unsubscribe(telephon string, endpoint string, ctx context.Context) error
	// SetPreview guarda si el usuario quiere ver el texto del mensaje en la notificación.
	SetPreview(telephon string, preview bool, ctx context.Context) error
}

// PushRepoInterface es el subconjunto del repositorio que necesita ServicePush.
type PushRepoInterface interface {
	GetIdByTelephon(telephon string, ctx context.Context) (int, error)
	UpsertSubscription(sub *models.PushSubscription, ctx context.Context) error
	ListSubscriptionsByUser(userID uint, ctx context.Context) ([]models.PushSubscription, error)
	DeleteSubscriptionByEndpoint(userID uint, endpoint string, ctx context.Context) error
	GetPushPreviewDisabled(userID uint, ctx context.Context) (bool, error)
	SetPushPreviewDisabled(userID uint, disabled bool, ctx context.Context) error
}

type ServicePush struct {
	cfg  config.PushConfig
	repo PushRepoInterface
}

// InitServicePush crea el servicio de Web Push con su configuración VAPID y su repositorio.
func InitServicePush(cfg config.PushConfig, repo PushRepoInterface) PushServicer {
	return &ServicePush{cfg: cfg, repo: repo}
}

func (s *ServicePush) userID(telephon string, ctx context.Context) (uint, error) {
	id, err := s.repo.GetIdByTelephon(telephon, ctx)
	if err != nil {
		return 0, err
	}
	return uint(id), nil
}

// Config no consulta la BD si el push está deshabilitado.
func (s *ServicePush) Config(telephon string, ctx context.Context) (schemas.PushConfigResponse, error) {
	if !s.cfg.Enabled {
		return schemas.PushConfigResponse{}, nil
	}
	id, err := s.userID(telephon, ctx)
	if err != nil {
		return schemas.PushConfigResponse{}, err
	}
	disabled, err := s.repo.GetPushPreviewDisabled(id, ctx)
	if err != nil {
		return schemas.PushConfigResponse{}, err
	}
	return schemas.PushConfigResponse{
		Enabled:   true,
		PublicKey: s.cfg.PublicKey,
		Preview:   s.cfg.Preview && !disabled,
	}, nil
}

// Subscribe valida la suscripción (defensa en profundidad, el middleware ya lo
// hizo), aplica el límite por usuario y hace el upsert por endpoint. El límite
// se comprueba antes del upsert sin bloqueo: dos altas simultáneas pueden
// dejar al usuario con una suscripción de más, lo cual es inocuo.
func (s *ServicePush) Subscribe(telephon string, input models.PushSubscriptionInput, userAgent string, ctx context.Context) (bool, error) {
	if !s.cfg.Enabled {
		return false, ErrPushDisabled
	}
	if !utils.IsAllowedPushEndpoint(input.Endpoint) || !utils.ValidPushKeys(input.Keys.P256dh, input.Keys.Auth) {
		return false, ErrPushInvalid
	}
	id, err := s.userID(telephon, ctx)
	if err != nil {
		return false, err
	}
	existing, err := s.repo.ListSubscriptionsByUser(id, ctx)
	if err != nil {
		return false, fmt.Errorf("listar suscripciones push: %w", err)
	}
	created := true
	for _, sub := range existing {
		if sub.Endpoint == input.Endpoint {
			created = false
			break
		}
	}
	if created && len(existing) >= MaxPushSubscriptionsPerUser {
		return false, ErrPushLimit
	}
	sub := &models.PushSubscription{
		UserID:    id,
		Endpoint:  input.Endpoint,
		P256dh:    input.Keys.P256dh,
		Auth:      input.Keys.Auth,
		UserAgent: truncateRunes(userAgent, maxPushUserAgentLen),
	}
	if err := s.repo.UpsertSubscription(sub, ctx); err != nil {
		return false, fmt.Errorf("guardar suscripción push: %w", err)
	}
	return created, nil
}

func (s *ServicePush) Unsubscribe(telephon string, endpoint string, ctx context.Context) error {
	id, err := s.userID(telephon, ctx)
	if err != nil {
		return err
	}
	return s.repo.DeleteSubscriptionByEndpoint(id, endpoint, ctx)
}

func (s *ServicePush) SetPreview(telephon string, preview bool, ctx context.Context) error {
	if !s.cfg.Enabled {
		return ErrPushDisabled
	}
	id, err := s.userID(telephon, ctx)
	if err != nil {
		return err
	}
	return s.repo.SetPushPreviewDisabled(id, !preview, ctx)
}

// truncateRunes corta s a max caracteres (no bytes) para no partir un UTF-8.
func truncateRunes(s string, max int) string {
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	return string(r[:max])
}
