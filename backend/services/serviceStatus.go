package services

import (
	"context"
	"errors"
	"sort"
	"strings"
	"time"

	"gorm/backend/models"
)

type StatusServicer interface {
	CreateStatus(telephon string, payload models.StatusCreate, ctx context.Context) (*models.Status, error)
	GetFeed(telephon string, ctx context.Context) (*models.StatusFeedResponse, error)
	MarkViewed(telephon string, statusID uint, ctx context.Context) (*models.StatusViewedEvent, error)
	DeleteStatus(telephon string, statusID uint, ctx context.Context) error
	GetAudienceTelephons(telephon string, ctx context.Context) ([]string, error)
}

type StatusRepoInterface interface {
	CreateStatus(status *models.Status, ctx context.Context) error
	GetIdByTelephon(telephon string, ctx context.Context) (uint, error)
	GetActiveStatusByID(statusID uint, ctx context.Context) (*models.Status, error)
	DeleteStatus(ownerID uint, statusID uint, ctx context.Context) error
	CreateStatusView(statusID uint, viewerID uint, ctx context.Context) error
	CanViewerSeeOwner(viewerID uint, ownerID uint, ctx context.Context) (bool, error)
	GetStatusAudienceTelephons(ownerID uint, ctx context.Context) ([]string, error)
	ListOwnActiveStatuses(ownerID uint, ctx context.Context) ([]models.StatusFeedRow, error)
	ListFeedForViewer(viewerID uint, ctx context.Context) ([]models.StatusFeedRow, error)
	ListStatusViewers(ownerID uint, statusIDs []uint, ctx context.Context) ([]models.StatusViewerRow, error)
	CountStatusViews(statusID uint, ctx context.Context) (int64, error)
}

type ServiceStatus struct {
	repo StatusRepoInterface
}

func InitServiceStatus(repo StatusRepoInterface) StatusServicer {
	return &ServiceStatus{repo: repo}
}

func (sr *ServiceStatus) CreateStatus(telephon string, payload models.StatusCreate, ctx context.Context) (*models.Status, error) {
	text := strings.TrimSpace(payload.Text)
	background := strings.TrimSpace(payload.Background)
	mediaURL := strings.TrimSpace(payload.MediaUrl)
	mediaType := strings.TrimSpace(payload.MediaType)

	if text == "" && mediaURL == "" {
		return nil, errors.New("debes escribir algo o adjuntar una foto o video")
	}
	if mediaURL != "" && mediaType != "image" && mediaType != "video" {
		return nil, errors.New("solo se permiten estados con foto o video")
	}
	if len(text) > 700 {
		return nil, errors.New("el texto del estado es demasiado largo")
	}

	ownerID, err := sr.repo.GetIdByTelephon(telephon, ctx)
	if err != nil {
		return nil, err
	}

	status := &models.Status{
		OwnerID:    ownerID,
		Text:       text,
		MediaUrl:   mediaURL,
		MediaType:  mediaType,
		Background: background,
		ExpiresAt:  time.Now().UTC().Add(24 * time.Hour),
	}
	if err := sr.repo.CreateStatus(status, ctx); err != nil {
		return nil, err
	}
	return status, nil
}

func (sr *ServiceStatus) GetFeed(telephon string, ctx context.Context) (*models.StatusFeedResponse, error) {
	viewerID, err := sr.repo.GetIdByTelephon(telephon, ctx)
	if err != nil {
		return nil, err
	}

	myRows, err := sr.repo.ListOwnActiveStatuses(viewerID, ctx)
	if err != nil {
		return nil, err
	}
	contactRows, err := sr.repo.ListFeedForViewer(viewerID, ctx)
	if err != nil {
		return nil, err
	}

	response := &models.StatusFeedResponse{
		MyStatuses: buildStatusThread(myRows, true),
		Contacts:   buildStatusThreads(contactRows),
	}

	if response.MyStatuses != nil && len(response.MyStatuses.Statuses) > 0 {
		statusIDs := make([]uint, 0, len(response.MyStatuses.Statuses))
		for _, status := range response.MyStatuses.Statuses {
			statusIDs = append(statusIDs, status.ID)
		}

		viewerRows, viewerErr := sr.repo.ListStatusViewers(viewerID, statusIDs, ctx)
		if viewerErr != nil {
			return nil, viewerErr
		}

		viewersByStatus := make(map[uint][]models.StatusViewer)
		for _, row := range viewerRows {
			viewersByStatus[row.StatusID] = append(viewersByStatus[row.StatusID], models.StatusViewer{
				ViewerTelephon: row.ViewerTelephon,
				ViewerUsername: row.ViewerUsername,
				ViewerName:     firstNonEmpty(row.ViewerName, row.ViewerUsername, row.ViewerTelephon),
				ViewerAvatar:   row.ViewerAvatar,
				ViewedAt:       row.ViewedAt,
			})
		}

		for index := range response.MyStatuses.Statuses {
			statusID := response.MyStatuses.Statuses[index].ID
			response.MyStatuses.Statuses[index].Viewers = viewersByStatus[statusID]
		}
	}

	return response, nil
}

func (sr *ServiceStatus) MarkViewed(telephon string, statusID uint, ctx context.Context) (*models.StatusViewedEvent, error) {
	viewerID, err := sr.repo.GetIdByTelephon(telephon, ctx)
	if err != nil {
		return nil, err
	}
	status, err := sr.repo.GetActiveStatusByID(statusID, ctx)
	if err != nil {
		return nil, errors.New("estado no disponible")
	}
	if status.OwnerID == viewerID {
		return nil, nil
	}
	allowed, err := sr.repo.CanViewerSeeOwner(viewerID, status.OwnerID, ctx)
	if err != nil {
		return nil, err
	}
	if !allowed {
		return nil, errors.New("no puedes ver este estado")
	}
	if err := sr.repo.CreateStatusView(statusID, viewerID, ctx); err != nil {
		return nil, err
	}

	viewerRows, err := sr.repo.ListStatusViewers(status.OwnerID, []uint{statusID}, ctx)
	if err != nil {
		return nil, err
	}

	var viewer models.StatusViewer
	for _, row := range viewerRows {
		if row.ViewerTelephon == telephon {
			viewer = models.StatusViewer{
				ViewerTelephon: row.ViewerTelephon,
				ViewerUsername: row.ViewerUsername,
				ViewerName:     firstNonEmpty(row.ViewerName, row.ViewerUsername, row.ViewerTelephon),
				ViewerAvatar:   row.ViewerAvatar,
				ViewedAt:       row.ViewedAt,
			}
			break
		}
	}

	viewCount, err := sr.repo.CountStatusViews(statusID, ctx)
	if err != nil {
		return nil, err
	}

	ownerRows, err := sr.repo.ListStatusViewers(status.OwnerID, []uint{statusID}, ctx)
	if err != nil {
		return nil, err
	}
	ownerTelephon := ""
	if len(ownerRows) > 0 {
		ownerTelephon = ownerRows[0].OwnerTelephon
	}

	if ownerTelephon == "" {
		feedRows, feedErr := sr.repo.ListOwnActiveStatuses(status.OwnerID, ctx)
		if feedErr == nil {
			for _, row := range feedRows {
				if row.StatusID == statusID {
					ownerTelephon = row.OwnerTelephon
					break
				}
			}
		}
	}

	return &models.StatusViewedEvent{
		OwnerTelephon: ownerTelephon,
		StatusID:      statusID,
		ViewCount:     viewCount,
		Viewer:        viewer,
	}, nil
}

func (sr *ServiceStatus) DeleteStatus(telephon string, statusID uint, ctx context.Context) error {
	ownerID, err := sr.repo.GetIdByTelephon(telephon, ctx)
	if err != nil {
		return err
	}
	return sr.repo.DeleteStatus(ownerID, statusID, ctx)
}

func (sr *ServiceStatus) GetAudienceTelephons(telephon string, ctx context.Context) ([]string, error) {
	ownerID, err := sr.repo.GetIdByTelephon(telephon, ctx)
	if err != nil {
		return nil, err
	}
	return sr.repo.GetStatusAudienceTelephons(ownerID, ctx)
}

func buildStatusThreads(rows []models.StatusFeedRow) []models.StatusThread {
	threadsByOwner := make(map[string]*models.StatusThread)
	order := make([]string, 0)
	for _, row := range rows {
		thread, exists := threadsByOwner[row.OwnerTelephon]
		if !exists {
			thread = &models.StatusThread{
				OwnerTelephon: row.OwnerTelephon,
				OwnerUsername: row.OwnerUsername,
				OwnerName:     firstNonEmpty(row.ContactName, row.OwnerUsername, row.OwnerTelephon),
				OwnerAvatar:   row.OwnerAvatar,
				Statuses:      []models.StatusItem{},
			}
			threadsByOwner[row.OwnerTelephon] = thread
			order = append(order, row.OwnerTelephon)
		}
		thread.Statuses = append(thread.Statuses, mapRowToStatusItem(row))
		if row.CreatedAt.After(thread.LastStatusAt) {
			thread.LastStatusAt = row.CreatedAt
		}
		if !row.Viewed {
			thread.HasUnviewed = true
		}
	}
	threads := make([]models.StatusThread, 0, len(order))
	for _, key := range order {
		threads = append(threads, *threadsByOwner[key])
	}
	sort.SliceStable(threads, func(i, j int) bool {
		return threads[i].LastStatusAt.After(threads[j].LastStatusAt)
	})
	return threads
}

func buildStatusThread(rows []models.StatusFeedRow, viewed bool) *models.StatusThread {
	if len(rows) == 0 {
		return nil
	}
	thread := buildStatusThreads(rows)[0]
	if viewed {
		thread.HasUnviewed = false
		for index := range thread.Statuses {
			thread.Statuses[index].Viewed = true
		}
	}
	return &thread
}

func mapRowToStatusItem(row models.StatusFeedRow) models.StatusItem {
	return models.StatusItem{
		ID:         row.StatusID,
		Text:       row.Text,
		MediaUrl:   row.MediaUrl,
		MediaType:  row.MediaType,
		Background: row.Background,
		CreatedAt:  row.CreatedAt,
		ExpiresAt:  row.ExpiresAt,
		ViewCount:  row.ViewCount,
		Viewed:     row.Viewed,
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}
