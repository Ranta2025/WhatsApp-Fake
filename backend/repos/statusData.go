package repos

import (
	"context"
	"gorm/backend/models"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// CreateStatus persiste un nuevo estado.
func (ap *ApiContact) CreateStatus(status *models.Status, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	return ap.data.WithContext(c).Create(status).Error
}

// GetStatusByID obtiene un estado activo (no expirado) por su ID.
func (ap *ApiContact) GetStatusByID(id uint, ctx context.Context) (*models.Status, error) {
	c, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	var status models.Status
	result := ap.data.WithContext(c).
		Where("expires_at > ?", time.Now()).
		First(&status, id)
	if result.Error != nil {
		return nil, result.Error
	}
	return &status, nil
}

// GetActiveStatusesByUserIDs obtiene todos los estados no expirados de la
// lista de usuarios indicada, ordenados por fecha de creación descendente.
func (ap *ApiContact) GetActiveStatusesByUserIDs(userIDs []uint, ctx context.Context) ([]models.Status, error) {
	if len(userIDs) == 0 {
		return []models.Status{}, nil
	}
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	var statuses []models.Status
	result := ap.data.WithContext(c).
		Where("user_id IN ? AND expires_at > ?", userIDs, time.Now()).
		Order("created_at DESC").
		Find(&statuses)
	return statuses, result.Error
}

// DeleteStatus borra (soft-delete de GORM) un estado, solo si pertenece a
// ownerID. Devuelve gorm.ErrRecordNotFound si no existe o no es el dueño.
func (ap *ApiContact) DeleteStatus(statusID uint, ownerID uint, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	result := ap.data.WithContext(c).
		Where("id = ? AND user_id = ?", statusID, ownerID).
		Delete(&models.Status{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

// CreateStatusView registra que viewerID vio el estado statusID. Es idempotente:
// si ya existía la vista, no crea un duplicado y devuelve created=false.
func (ap *ApiContact) CreateStatusView(statusID uint, viewerID uint, ctx context.Context) (bool, error) {
	c, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	view := models.StatusView{
		StatusID: statusID,
		ViewerID: viewerID,
		ViewedAt: time.Now(),
	}
	result := ap.data.WithContext(c).
		Clauses(clause.OnConflict{DoNothing: true}).
		Create(&view)
	if result.Error != nil {
		return false, result.Error
	}
	return result.RowsAffected > 0, nil
}

// GetStatusViewers obtiene todas las vistas de un estado, más recientes primero.
func (ap *ApiContact) GetStatusViewers(statusID uint, ctx context.Context) ([]models.StatusView, error) {
	c, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	var views []models.StatusView
	result := ap.data.WithContext(c).
		Where("status_id = ?", statusID).
		Order("viewed_at DESC").
		Find(&views)
	return views, result.Error
}

// GetViewedStatusIDs indica, de la lista de statusIDs dada, cuáles ya vio viewerID.
func (ap *ApiContact) GetViewedStatusIDs(viewerID uint, statusIDs []uint, ctx context.Context) (map[uint]bool, error) {
	result := make(map[uint]bool, len(statusIDs))
	if len(statusIDs) == 0 {
		return result, nil
	}
	c, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	var ids []uint
	if err := ap.data.WithContext(c).Model(&models.StatusView{}).
		Select("status_id").
		Where("viewer_id = ? AND status_id IN ?", viewerID, statusIDs).
		Scan(&ids).Error; err != nil {
		return nil, err
	}
	for _, id := range ids {
		result[id] = true
	}
	return result, nil
}

// GetViewCounts devuelve, para cada statusID dado, el número de vistas registradas.
func (ap *ApiContact) GetViewCounts(statusIDs []uint, ctx context.Context) (map[uint]int64, error) {
	result := make(map[uint]int64, len(statusIDs))
	if len(statusIDs) == 0 {
		return result, nil
	}
	c, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	type row struct {
		StatusID uint
		Count    int64
	}
	var rows []row
	if err := ap.data.WithContext(c).Model(&models.StatusView{}).
		Select("status_id, COUNT(*) AS count").
		Where("status_id IN ?", statusIDs).
		Group("status_id").
		Scan(&rows).Error; err != nil {
		return nil, err
	}
	for _, r := range rows {
		result[r.StatusID] = r.Count
	}
	return result, nil
}

// GetMutualContactIDs obtiene los IDs de los contactos MUTUOS de userID: solo
// aquellos que userID tiene aceptados Y que a la vez tienen a userID aceptado.
// Es la relación usada para la visibilidad de estados (como WhatsApp).
func (ap *ApiContact) GetMutualContactIDs(userID uint, ctx context.Context) ([]uint, error) {
	c, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	var ids []uint
	result := ap.data.WithContext(c).Table("contact_data_bases AS c1").
		Select("c1.id_contact").
		Joins(`INNER JOIN contact_data_bases AS c2
			ON c2.id_user = c1.id_contact AND c2.id_contact = c1.id_user
			AND c2.status = 'accepted' AND c2.deleted_at IS NULL`).
		Where("c1.id_user = ? AND c1.status = 'accepted' AND c1.deleted_at IS NULL", userID).
		Scan(&ids)
	return ids, result.Error
}

// IsMutualContact indica si userID y otherID son contactos mutuos (ambos se
// tienen agregados con status='accepted').
func (ap *ApiContact) IsMutualContact(userID uint, otherID uint, ctx context.Context) (bool, error) {
	c, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	var count int64
	result := ap.data.WithContext(c).Table("contact_data_bases AS c1").
		Joins(`INNER JOIN contact_data_bases AS c2
			ON c2.id_user = c1.id_contact AND c2.id_contact = c1.id_user
			AND c2.status = 'accepted' AND c2.deleted_at IS NULL`).
		Where("c1.id_user = ? AND c1.id_contact = ? AND c1.status = 'accepted' AND c1.deleted_at IS NULL", userID, otherID).
		Count(&count)
	if result.Error != nil {
		return false, result.Error
	}
	return count > 0, nil
}

// DeleteExpiredStatuses borra definitivamente (hard delete) los estados
// expirados y sus vistas asociadas. Se usa desde el job de limpieza periódico.
func (ap *ApiContact) DeleteExpiredStatuses(ctx context.Context) (int64, error) {
	c, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	var expiredIDs []uint
	if err := ap.data.WithContext(c).Model(&models.Status{}).
		Unscoped().
		Select("id").
		Where("expires_at <= ?", time.Now()).
		Scan(&expiredIDs).Error; err != nil {
		return 0, err
	}
	if len(expiredIDs) == 0 {
		return 0, nil
	}

	err := ap.data.WithContext(c).Transaction(func(tx *gorm.DB) error {
		if err := tx.Unscoped().Where("status_id IN ?", expiredIDs).Delete(&models.StatusView{}).Error; err != nil {
			return err
		}
		return tx.Unscoped().Where("id IN ?", expiredIDs).Delete(&models.Status{}).Error
	})
	if err != nil {
		return 0, err
	}
	return int64(len(expiredIDs)), nil
}
