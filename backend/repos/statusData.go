package repos

import (
	"context"
	"errors"
	"time"

	"gorm/backend/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type ApiStatus struct {
	data *gorm.DB
}

type statusBaseQueryParams struct {
	viewerID uint
	ownerID  uint
	own      bool
}

func InitRepoStatus(data *gorm.DB) *ApiStatus {
	return &ApiStatus{data: data}
}

func (ap *ApiStatus) CreateStatus(status *models.Status, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	return ap.data.WithContext(c).Create(status).Error
}

func (ap *ApiStatus) GetIdByTelephon(telephon string, ctx context.Context) (uint, error) {
	c, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	var id uint
	if err := ap.data.WithContext(c).
		Model(&models.UserDataBase{}).
		Select("id").
		Where("telephon = ?", telephon).
		Scan(&id).Error; err != nil {
		return 0, err
	}
	if id == 0 {
		return 0, errors.New("usuario no encontrado")
	}
	return id, nil
}

func (ap *ApiStatus) GetActiveStatusByID(statusID uint, ctx context.Context) (*models.Status, error) {
	c, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	var status models.Status
	if err := ap.data.WithContext(c).
		Where("id = ? AND expires_at > ?", statusID, time.Now().UTC()).
		First(&status).Error; err != nil {
		return nil, err
	}
	return &status, nil
}

func (ap *ApiStatus) DeleteStatus(ownerID uint, statusID uint, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	result := ap.data.WithContext(c).
		Where("id = ? AND owner_id = ?", statusID, ownerID).
		Delete(&models.Status{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return errors.New("estado no encontrado")
	}
	return nil
}

func (ap *ApiStatus) CreateStatusView(statusID uint, viewerID uint, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	view := models.StatusView{
		StatusID: statusID,
		ViewerID: viewerID,
		ViewedAt: time.Now().UTC(),
	}
	return ap.data.WithContext(c).
		Clauses(clause.OnConflict{DoNothing: true}).
		Create(&view).Error
}

func (ap *ApiStatus) CanViewerSeeOwner(viewerID uint, ownerID uint, ctx context.Context) (bool, error) {
	if viewerID == ownerID {
		return true, nil
	}
	c, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	var count int64
	err := ap.data.WithContext(c).
		Model(&models.ContactDataBase{}).
		Where("id_user = ? AND id_contact = ? AND status = ?", ownerID, viewerID, "accepted").
		Count(&count).Error
	return count > 0, err
}

func (ap *ApiStatus) GetStatusAudienceTelephons(ownerID uint, ctx context.Context) ([]string, error) {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	var telephons []string
	err := ap.data.WithContext(c).
		Table("contact_data_bases").
		Distinct("user_data_bases.telephon").
		Joins("INNER JOIN user_data_bases ON user_data_bases.id = contact_data_bases.id_contact").
		Where("contact_data_bases.id_user = ? AND contact_data_bases.status = ?", ownerID, "accepted").
		Scan(&telephons).Error
	return telephons, err
}

func (ap *ApiStatus) ListStatusViewers(ownerID uint, statusIDs []uint, ctx context.Context) ([]models.StatusViewerRow, error) {
	if len(statusIDs) == 0 {
		return nil, nil
	}

	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	var rows []models.StatusViewerRow
	err := ap.data.WithContext(c).
		Table("status_views").
		Select(`
			status_views.status_id AS status_id,
			owners.telephon AS owner_telephon,
			viewers.telephon AS viewer_telephon,
			viewers.username AS viewer_username,
			viewers.avatar_url AS viewer_avatar,
			COALESCE(contact_data_bases.contact_name, '') AS viewer_name,
			status_views.viewed_at AS viewed_at
		`).
		Joins("INNER JOIN statuses ON statuses.id = status_views.status_id").
		Joins("INNER JOIN user_data_bases AS owners ON owners.id = statuses.owner_id").
		Joins("INNER JOIN user_data_bases AS viewers ON viewers.id = status_views.viewer_id").
		Joins("LEFT JOIN contact_data_bases ON contact_data_bases.id_user = ? AND contact_data_bases.id_contact = status_views.viewer_id AND contact_data_bases.status = ?", ownerID, "accepted").
		Where("status_views.deleted_at IS NULL AND status_views.status_id IN ?", statusIDs).
		Order("status_views.viewed_at DESC").
		Scan(&rows).Error

	return rows, err
}

func (ap *ApiStatus) CountStatusViews(statusID uint, ctx context.Context) (int64, error) {
	c, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	var count int64
	err := ap.data.WithContext(c).
		Model(&models.StatusView{}).
		Where("status_id = ?", statusID).
		Count(&count).Error
	return count, err
}

func (ap *ApiStatus) ListOwnActiveStatuses(ownerID uint, ctx context.Context) ([]models.StatusFeedRow, error) {
	return ap.listStatuses(statusBaseQueryParams{viewerID: ownerID, ownerID: ownerID, own: true}, ctx)
}

func (ap *ApiStatus) ListFeedForViewer(viewerID uint, ctx context.Context) ([]models.StatusFeedRow, error) {
	return ap.listStatuses(statusBaseQueryParams{viewerID: viewerID, own: false}, ctx)
}

func (ap *ApiStatus) listStatuses(params statusBaseQueryParams, ctx context.Context) ([]models.StatusFeedRow, error) {
	c, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	query := ap.data.WithContext(c).
		Table("statuses").
		Select(`
			statuses.id AS status_id,
			statuses.owner_id AS owner_id,
			user_data_bases.telephon AS owner_telephon,
			user_data_bases.username AS owner_username,
			user_data_bases.avatar_url AS owner_avatar,
			COALESCE(contact_data_bases.contact_name, '') AS contact_name,
			statuses.text AS text,
			statuses.media_url AS media_url,
			statuses.media_type AS media_type,
			statuses.background AS background,
			statuses.created_at AS created_at,
			statuses.expires_at AS expires_at,
			COUNT(DISTINCT status_views_all.id) AS view_count,
			CASE WHEN status_views_self.id IS NULL THEN false ELSE true END AS viewed
		`).
		Joins("INNER JOIN user_data_bases ON user_data_bases.id = statuses.owner_id").
		Joins("LEFT JOIN status_views AS status_views_all ON status_views_all.status_id = statuses.id").
		Joins("LEFT JOIN status_views AS status_views_self ON status_views_self.status_id = statuses.id AND status_views_self.viewer_id = ?", params.viewerID).
		Where("statuses.deleted_at IS NULL AND statuses.expires_at > ?", time.Now().UTC()).
		Group(`
			statuses.id,
			statuses.owner_id,
			user_data_bases.telephon,
			user_data_bases.username,
			user_data_bases.avatar_url,
			contact_data_bases.contact_name,
			status_views_self.id
		`).
		Order("statuses.created_at ASC")

	if params.own {
		query = query.
			Joins("LEFT JOIN contact_data_bases ON contact_data_bases.id_user = ? AND contact_data_bases.id_contact = statuses.owner_id AND contact_data_bases.status = ?", params.ownerID, "accepted").
			Where("statuses.owner_id = ?", params.ownerID)
	} else {
		query = query.
			Joins("INNER JOIN contact_data_bases ON contact_data_bases.id_user = statuses.owner_id AND contact_data_bases.id_contact = ? AND contact_data_bases.status = ?", params.viewerID, "accepted").
			Where("statuses.owner_id <> ?", params.viewerID)
	}

	var rows []models.StatusFeedRow
	if err := query.Scan(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}
