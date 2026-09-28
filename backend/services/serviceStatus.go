package services

import (
	"context"
	"errors"
	"gorm/backend/models"
	"gorm/backend/schemas"
	"gorm/backend/utils"
	"log"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode/utf8"
)

// maxStatusContentLen es el máximo de caracteres para el texto/leyenda de un estado.
const maxStatusContentLen = 700

// statusExpiry es cuánto dura visible un estado tras publicarse (como WhatsApp).
const statusExpiry = 24 * time.Hour

var hexColorRegexp = regexp.MustCompile(`^#[0-9A-Fa-f]{6}$`)

// StatusServicer define las operaciones de negocio del feature de "Estados" (stories).
type StatusServicer interface {
	// CreateStatus publica un nuevo estado y devuelve el item creado, los datos
	// públicos del dueño y los teléfonos de sus contactos MUTUOS (para notificar por WS).
	CreateStatus(telephon string, input models.StatusCreate, ctx context.Context) (schemas.StatusItem, schemas.StatusOwnerBrief, []string, error)
	// GetFeed obtiene "mis estados" y los de mis contactos mutuos, agrupados y ordenados.
	GetFeed(telephon string, ctx context.Context) (schemas.StatusFeed, error)
	// MarkStatusViewed marca un estado como visto por telephon. Si el propio dueño
	// "ve" su estado, no se crea ninguna vista (created=false, sin error).
	MarkStatusViewed(telephon string, statusID uint, ctx context.Context) (created bool, ownerTelephon string, viewer schemas.StatusViewer, viewCount int64, err error)
	// GetStatusViewers lista quién vio un estado (solo el dueño puede consultarlo).
	GetStatusViewers(telephon string, statusID uint, ctx context.Context) ([]schemas.StatusViewer, error)
	// DeleteStatus borra un estado propio y devuelve los teléfonos de los
	// contactos mutuos a notificar por WS.
	DeleteStatus(telephon string, statusID uint, ctx context.Context) ([]string, error)
	// CleanupExpiredStatuses borra los estados expirados y sus vistas (job periódico).
	CleanupExpiredStatuses(ctx context.Context) (int64, error)
}

// StatusRepoInterface es el subconjunto del repositorio que necesita ServiceStatus.
type StatusRepoInterface interface {
	GetIdByTelephon(telephon string, ctx context.Context) (int, error)
	GetTelephonByID(id uint, ctx context.Context) (string, error)
	GetUsersBasicByIDs(ids []uint, ctx context.Context) (map[uint]models.UserBasic, error)
	GetAddedContactIDs(userID uint, ctx context.Context) (map[uint]string, error)
	GetMutualContactIDs(userID uint, ctx context.Context) ([]uint, error)
	IsMutualContact(userID uint, otherID uint, ctx context.Context) (bool, error)
	CreateStatus(status *models.Status, ctx context.Context) error
	GetStatusByID(id uint, ctx context.Context) (*models.Status, error)
	GetActiveStatusesByUserIDs(userIDs []uint, ctx context.Context) ([]models.Status, error)
	DeleteStatus(statusID uint, ownerID uint, ctx context.Context) error
	CreateStatusView(statusID uint, viewerID uint, ctx context.Context) (bool, error)
	GetStatusViewers(statusID uint, ctx context.Context) ([]models.StatusView, error)
	GetViewedStatusIDs(viewerID uint, statusIDs []uint, ctx context.Context) (map[uint]bool, error)
	GetViewCounts(statusIDs []uint, ctx context.Context) (map[uint]int64, error)
	DeleteExpiredStatuses(ctx context.Context) (int64, error)
}

type ServiceStatus struct {
	repo StatusRepoInterface
}

// InitServiceStatus crea el servicio de estados con su repositorio, devolviendo la interfaz StatusServicer.
func InitServiceStatus(repo StatusRepoInterface) StatusServicer {
	return &ServiceStatus{repo: repo}
}

// validateStatusCreate valida (y normaliza) el body de creación de un estado
// según su tipo. No confía en el cliente para nada más que estos campos.
func validateStatusCreate(input *models.StatusCreate) error {
	switch input.Type {
	case "text":
		if strings.TrimSpace(input.Text) == "" {
			return errors.New("el texto del estado no puede estar vacío")
		}
		if utf8.RuneCountInString(input.Text) > maxStatusContentLen {
			return errors.New("el texto del estado no puede superar los 700 caracteres")
		}
		if input.BackgroundColor != "" && !hexColorRegexp.MatchString(input.BackgroundColor) {
			return errors.New("el color de fondo debe tener formato hexadecimal (#RRGGBB)")
		}
		input.MediaUrl = ""
		input.Caption = ""
	case "image", "video":
		if input.MediaUrl == "" {
			return errors.New("el estado de imagen/video requiere una URL de archivo")
		}
		if !utils.IsSafeMediaURL(input.MediaUrl) {
			return errors.New("URL del archivo adjunto no válida")
		}
		if utf8.RuneCountInString(input.Caption) > maxStatusContentLen {
			return errors.New("la leyenda no puede superar los 700 caracteres")
		}
		input.Text = ""
		input.BackgroundColor = ""
	default:
		return errors.New("tipo de estado no válido")
	}
	return nil
}

func statusToItem(st models.Status, viewed bool, viewCount int64) schemas.StatusItem {
	return schemas.StatusItem{
		ID:              st.ID,
		Type:            st.Type,
		Text:            st.Text,
		BackgroundColor: st.BackgroundColor,
		MediaUrl:        st.MediaUrl,
		Caption:         st.Caption,
		CreatedAt:       st.CreatedAt,
		ExpiresAt:       st.ExpiresAt,
		Viewed:          viewed,
		ViewCount:       viewCount,
	}
}

func statusIDsOf(list []models.Status) []uint {
	ids := make([]uint, 0, len(list))
	for _, st := range list {
		ids = append(ids, st.ID)
	}
	return ids
}

// CreateStatus valida, persiste y resuelve los contactos mutuos a notificar.
func (s *ServiceStatus) CreateStatus(telephon string, input models.StatusCreate, ctx context.Context) (schemas.StatusItem, schemas.StatusOwnerBrief, []string, error) {
	if err := validateStatusCreate(&input); err != nil {
		return schemas.StatusItem{}, schemas.StatusOwnerBrief{}, nil, err
	}

	userIDInt, err := s.repo.GetIdByTelephon(telephon, ctx)
	if err != nil {
		return schemas.StatusItem{}, schemas.StatusOwnerBrief{}, nil, err
	}
	userID := uint(userIDInt)

	status := &models.Status{
		UserID:          userID,
		Type:            input.Type,
		Text:            input.Text,
		BackgroundColor: input.BackgroundColor,
		MediaUrl:        input.MediaUrl,
		Caption:         input.Caption,
		ExpiresAt:       time.Now().Add(statusExpiry),
	}
	if err := s.repo.CreateStatus(status, ctx); err != nil {
		return schemas.StatusItem{}, schemas.StatusOwnerBrief{}, nil, err
	}

	item := statusToItem(*status, true, 0)

	ownerMap, err := s.repo.GetUsersBasicByIDs([]uint{userID}, ctx)
	if err != nil {
		// El estado ya se creó: devolvemos el item con lo poco que tenemos.
		log.Printf("[STATUS-SERVICE] Error resolviendo datos del dueño %d: %v", userID, err)
		return item, schemas.StatusOwnerBrief{Telephon: telephon}, nil, nil
	}
	ownerUser := ownerMap[userID]
	owner := schemas.StatusOwnerBrief{
		Telephon:  telephon,
		Username:  ownerUser.Username,
		AvatarUrl: ownerUser.AvatarUrl,
	}

	mutualIDs, err := s.repo.GetMutualContactIDs(userID, ctx)
	if err != nil {
		log.Printf("[STATUS-SERVICE] Error resolviendo contactos mutuos de %d: %v", userID, err)
		return item, owner, nil, nil
	}
	if len(mutualIDs) == 0 {
		return item, owner, nil, nil
	}
	mutualUsers, err := s.repo.GetUsersBasicByIDs(mutualIDs, ctx)
	if err != nil {
		log.Printf("[STATUS-SERVICE] Error resolviendo teléfonos de contactos mutuos: %v", err)
		return item, owner, nil, nil
	}
	telephons := make([]string, 0, len(mutualIDs))
	for _, id := range mutualIDs {
		if u, ok := mutualUsers[id]; ok {
			telephons = append(telephons, u.Telephon)
		}
	}
	return item, owner, telephons, nil
}

// GetFeed construye "mis estados" y los de mis contactos mutuos.
func (s *ServiceStatus) GetFeed(telephon string, ctx context.Context) (schemas.StatusFeed, error) {
	userIDInt, err := s.repo.GetIdByTelephon(telephon, ctx)
	if err != nil {
		return schemas.StatusFeed{}, err
	}
	userID := uint(userIDInt)

	mine, err := s.repo.GetActiveStatusesByUserIDs([]uint{userID}, ctx)
	if err != nil {
		return schemas.StatusFeed{}, err
	}
	mineViewCounts, err := s.repo.GetViewCounts(statusIDsOf(mine), ctx)
	if err != nil {
		return schemas.StatusFeed{}, err
	}
	mineItems := make([]schemas.StatusItem, 0, len(mine))
	for _, st := range mine {
		mineItems = append(mineItems, statusToItem(st, true, mineViewCounts[st.ID]))
	}

	mutualIDs, err := s.repo.GetMutualContactIDs(userID, ctx)
	if err != nil {
		return schemas.StatusFeed{}, err
	}

	contactStatuses, err := s.repo.GetActiveStatusesByUserIDs(mutualIDs, ctx)
	if err != nil {
		return schemas.StatusFeed{}, err
	}

	viewedMap, err := s.repo.GetViewedStatusIDs(userID, statusIDsOf(contactStatuses), ctx)
	if err != nil {
		return schemas.StatusFeed{}, err
	}
	contactNames, err := s.repo.GetAddedContactIDs(userID, ctx)
	if err != nil {
		return schemas.StatusFeed{}, err
	}
	usersMap, err := s.repo.GetUsersBasicByIDs(mutualIDs, ctx)
	if err != nil {
		return schemas.StatusFeed{}, err
	}

	grouped := make(map[uint]*schemas.StatusContactGroup, len(mutualIDs))
	order := make([]uint, 0, len(mutualIDs))
	for _, st := range contactStatuses {
		group, ok := grouped[st.UserID]
		if !ok {
			user := usersMap[st.UserID]
			group = &schemas.StatusContactGroup{
				StatusOwnerBrief: schemas.StatusOwnerBrief{
					Telephon:    user.Telephon,
					Username:    user.Username,
					ContactName: contactNames[st.UserID],
					AvatarUrl:   user.AvatarUrl,
				},
				AllViewed: true,
			}
			grouped[st.UserID] = group
			order = append(order, st.UserID)
		}
		viewed := viewedMap[st.ID]
		item := statusToItem(st, viewed, 0)
		group.Statuses = append(group.Statuses, item)
		if !viewed {
			group.AllViewed = false
		}
		if st.CreatedAt.After(group.LastUpdated) {
			group.LastUpdated = st.CreatedAt
		}
	}

	contacts := make([]schemas.StatusContactGroup, 0, len(order))
	for _, id := range order {
		contacts = append(contacts, *grouped[id])
	}
	// Contactos con estados no vistos primero; dentro de cada grupo, más recientes primero.
	sort.SliceStable(contacts, func(i, j int) bool {
		if contacts[i].AllViewed != contacts[j].AllViewed {
			return !contacts[i].AllViewed
		}
		return contacts[i].LastUpdated.After(contacts[j].LastUpdated)
	})

	return schemas.StatusFeed{Mine: mineItems, Contacts: contacts}, nil
}

// MarkStatusViewed registra que telephon vio el estado statusID (idempotente),
// exigiendo que sea contacto mutuo del dueño. El dueño viendo su propio estado
// no genera vista.
func (s *ServiceStatus) MarkStatusViewed(telephon string, statusID uint, ctx context.Context) (bool, string, schemas.StatusViewer, int64, error) {
	userIDInt, err := s.repo.GetIdByTelephon(telephon, ctx)
	if err != nil {
		return false, "", schemas.StatusViewer{}, 0, err
	}
	userID := uint(userIDInt)

	status, err := s.repo.GetStatusByID(statusID, ctx)
	if err != nil {
		return false, "", schemas.StatusViewer{}, 0, err
	}

	if status.UserID == userID {
		return false, telephon, schemas.StatusViewer{}, 0, nil
	}

	mutual, err := s.repo.IsMutualContact(userID, status.UserID, ctx)
	if err != nil {
		return false, "", schemas.StatusViewer{}, 0, err
	}
	if !mutual {
		return false, "", schemas.StatusViewer{}, 0, errors.New("no autorizado para ver este estado")
	}

	created, err := s.repo.CreateStatusView(statusID, userID, ctx)
	if err != nil {
		return false, "", schemas.StatusViewer{}, 0, err
	}

	ownerTelephon, err := s.repo.GetTelephonByID(status.UserID, ctx)
	if err != nil {
		return created, "", schemas.StatusViewer{}, 0, err
	}

	counts, err := s.repo.GetViewCounts([]uint{statusID}, ctx)
	if err != nil {
		return created, ownerTelephon, schemas.StatusViewer{}, 0, err
	}

	usersMap, err := s.repo.GetUsersBasicByIDs([]uint{userID}, ctx)
	if err != nil {
		return created, ownerTelephon, schemas.StatusViewer{}, counts[statusID], err
	}
	viewerUser := usersMap[userID]
	viewer := schemas.StatusViewer{
		Telephon:  viewerUser.Telephon,
		Username:  viewerUser.Username,
		AvatarUrl: viewerUser.AvatarUrl,
		ViewedAt:  time.Now(),
	}
	return created, ownerTelephon, viewer, counts[statusID], nil
}

// GetStatusViewers lista quién vio un estado. Solo el dueño puede consultarlo.
func (s *ServiceStatus) GetStatusViewers(telephon string, statusID uint, ctx context.Context) ([]schemas.StatusViewer, error) {
	userIDInt, err := s.repo.GetIdByTelephon(telephon, ctx)
	if err != nil {
		return nil, err
	}
	userID := uint(userIDInt)

	status, err := s.repo.GetStatusByID(statusID, ctx)
	if err != nil {
		return nil, err
	}
	if status.UserID != userID {
		return nil, errors.New("no autorizado para ver los espectadores de este estado")
	}

	views, err := s.repo.GetStatusViewers(statusID, ctx)
	if err != nil {
		return nil, err
	}
	if len(views) == 0 {
		return []schemas.StatusViewer{}, nil
	}

	ids := make([]uint, 0, len(views))
	for _, v := range views {
		ids = append(ids, v.ViewerID)
	}
	usersMap, err := s.repo.GetUsersBasicByIDs(ids, ctx)
	if err != nil {
		return nil, err
	}

	result := make([]schemas.StatusViewer, 0, len(views))
	for _, v := range views {
		u := usersMap[v.ViewerID]
		result = append(result, schemas.StatusViewer{
			Telephon:  u.Telephon,
			Username:  u.Username,
			AvatarUrl: u.AvatarUrl,
			ViewedAt:  v.ViewedAt,
		})
	}
	return result, nil
}

// DeleteStatus borra un estado propio y resuelve los contactos mutuos a notificar.
func (s *ServiceStatus) DeleteStatus(telephon string, statusID uint, ctx context.Context) ([]string, error) {
	userIDInt, err := s.repo.GetIdByTelephon(telephon, ctx)
	if err != nil {
		return nil, err
	}
	userID := uint(userIDInt)

	if err := s.repo.DeleteStatus(statusID, userID, ctx); err != nil {
		return nil, err
	}

	mutualIDs, err := s.repo.GetMutualContactIDs(userID, ctx)
	if err != nil {
		log.Printf("[STATUS-SERVICE] Estado %d borrado pero no se pudo resolver a quién notificar: %v", statusID, err)
		return nil, nil
	}
	if len(mutualIDs) == 0 {
		return nil, nil
	}
	mutualUsers, err := s.repo.GetUsersBasicByIDs(mutualIDs, ctx)
	if err != nil {
		log.Printf("[STATUS-SERVICE] Estado %d borrado pero no se pudieron resolver teléfonos: %v", statusID, err)
		return nil, nil
	}
	telephons := make([]string, 0, len(mutualIDs))
	for _, id := range mutualIDs {
		if u, ok := mutualUsers[id]; ok {
			telephons = append(telephons, u.Telephon)
		}
	}
	return telephons, nil
}

// CleanupExpiredStatuses borra los estados expirados y sus vistas (job periódico).
func (s *ServiceStatus) CleanupExpiredStatuses(ctx context.Context) (int64, error) {
	return s.repo.DeleteExpiredStatuses(ctx)
}
