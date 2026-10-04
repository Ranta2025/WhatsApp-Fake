package repos

import (
	"context"
	"gorm/backend/models"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// pushTimeout acota cada consulta del repositorio de Web Push.
const pushTimeout = 5 * time.Second

// userIDResolver resuelve el ID de usuario a partir del teléfono del token
// (ApiContact.GetIdByTelephon, con caché en Redis).
type userIDResolver interface {
	GetIdByTelephon(telephon string, ctx context.Context) (int, error)
}

// RepoPush persiste las suscripciones Web Push y la preferencia de preview
// del usuario.
type RepoPush struct {
	data *gorm.DB
	ids  userIDResolver
}

// InitRepoPush crea el repositorio de Web Push. ids se usa para resolver el
// usuario autenticado reutilizando la caché del repositorio de contactos.
func InitRepoPush(data *gorm.DB, ids userIDResolver) *RepoPush {
	return &RepoPush{data: data, ids: ids}
}

// GetIdByTelephon delega en el resolvedor de IDs (con caché).
func (r *RepoPush) GetIdByTelephon(telephon string, ctx context.Context) (int, error) {
	return r.ids.GetIdByTelephon(telephon, ctx)
}

// UpsertSubscription inserta la suscripción o, si el endpoint ya existe
// (índice único idx_push_subscriptions_endpoint), la reasigna al usuario y
// actualiza sus claves y user agent. created_at y last_success_at se conservan.
func (r *RepoPush) UpsertSubscription(sub *models.PushSubscription, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, pushTimeout)
	defer cancel()
	return r.data.WithContext(c).
		Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "endpoint"}},
			DoUpdates: clause.AssignmentColumns([]string{"user_id", "p256dh", "auth", "user_agent"}),
		}).
		Create(sub).Error
}

// ListSubscriptionsByUser devuelve las suscripciones del usuario (orden de alta).
func (r *RepoPush) ListSubscriptionsByUser(userID uint, ctx context.Context) ([]models.PushSubscription, error) {
	c, cancel := context.WithTimeout(ctx, pushTimeout)
	defer cancel()
	var subs []models.PushSubscription
	err := r.data.WithContext(c).Where("user_id = ?", userID).Order("id").Find(&subs).Error
	return subs, err
}

// ListPushTargetsByTelephons devuelve las suscripciones de los usuarios
// (activos) con esos teléfonos, cada una con el teléfono del dueño y su
// preferencia de preview. Sin teléfonos no consulta.
func (r *RepoPush) ListPushTargetsByTelephons(telephons []string, ctx context.Context) ([]models.PushTarget, error) {
	if len(telephons) == 0 {
		return nil, nil
	}
	c, cancel := context.WithTimeout(ctx, pushTimeout)
	defer cancel()
	var targets []models.PushTarget
	err := r.data.WithContext(c).
		Table("push_subscriptions").
		Select("push_subscriptions.*, u.telephon, u.push_preview_disabled").
		Joins("JOIN user_data_bases u ON u.id = push_subscriptions.user_id AND u.deleted_at IS NULL").
		Where("u.telephon IN ?", telephons).
		Order("push_subscriptions.id").
		Find(&targets).Error
	return targets, err
}

// CountSubscriptionsByUser cuenta las suscripciones del usuario.
func (r *RepoPush) CountSubscriptionsByUser(userID uint, ctx context.Context) (int64, error) {
	c, cancel := context.WithTimeout(ctx, pushTimeout)
	defer cancel()
	var n int64
	err := r.data.WithContext(c).Model(&models.PushSubscription{}).Where("user_id = ?", userID).Count(&n).Error
	return n, err
}

// DeleteSubscriptionByEndpoint borra la suscripción solo si pertenece a
// userID. Es idempotente: no existir (o ser de otro usuario) no es error.
func (r *RepoPush) DeleteSubscriptionByEndpoint(userID uint, endpoint string, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, pushTimeout)
	defer cancel()
	return r.data.WithContext(c).
		Where("user_id = ? AND endpoint = ?", userID, endpoint).
		Delete(&models.PushSubscription{}).Error
}

// DeleteSubscriptionByID borra una suscripción (p. ej. tras un 404/410 del
// servicio de push).
func (r *RepoPush) DeleteSubscriptionByID(id uint, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, pushTimeout)
	defer cancel()
	return r.data.WithContext(c).Where("id = ?", id).Delete(&models.PushSubscription{}).Error
}

// MarkSubscriptionSuccess registra el último envío exitoso a la suscripción.
func (r *RepoPush) MarkSubscriptionSuccess(id uint, at time.Time, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, pushTimeout)
	defer cancel()
	return r.data.WithContext(c).Model(&models.PushSubscription{}).
		Where("id = ?", id).
		Update("last_success_at", at).Error
}

// GetPushPreviewDisabled lee la preferencia de preview del usuario.
func (r *RepoPush) GetPushPreviewDisabled(userID uint, ctx context.Context) (bool, error) {
	c, cancel := context.WithTimeout(ctx, pushTimeout)
	defer cancel()
	var disabled []bool
	err := r.data.WithContext(c).Model(&models.UserDataBase{}).
		Where("id = ?", userID).
		Pluck("push_preview_disabled", &disabled).Error
	if err != nil || len(disabled) == 0 {
		return false, err
	}
	return disabled[0], nil
}

// SetPushPreviewDisabled guarda la preferencia de preview del usuario.
func (r *RepoPush) SetPushPreviewDisabled(userID uint, disabled bool, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, pushTimeout)
	defer cancel()
	return r.data.WithContext(c).Model(&models.UserDataBase{}).
		Where("id = ?", userID).
		Update("push_preview_disabled", disabled).Error
}
