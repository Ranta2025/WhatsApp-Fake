package services

import (
	"context"
	"errors"
	"gorm/backend/models"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"gorm.io/gorm"
)

// ==================== MOCKS ====================

type MockStatusRepo struct {
	mock.Mock
}

func (m *MockStatusRepo) GetIdByTelephon(telephon string, ctx context.Context) (int, error) {
	args := m.Called(telephon, ctx)
	return args.Int(0), args.Error(1)
}

func (m *MockStatusRepo) GetTelephonByID(id uint, ctx context.Context) (string, error) {
	args := m.Called(id, ctx)
	return args.String(0), args.Error(1)
}

func (m *MockStatusRepo) GetUsersBasicByIDs(ids []uint, ctx context.Context) (map[uint]models.UserBasic, error) {
	args := m.Called(ids, ctx)
	return args.Get(0).(map[uint]models.UserBasic), args.Error(1)
}

func (m *MockStatusRepo) GetAddedContactIDs(userID uint, ctx context.Context) (map[uint]string, error) {
	args := m.Called(userID, ctx)
	return args.Get(0).(map[uint]string), args.Error(1)
}

func (m *MockStatusRepo) GetMutualContactIDs(userID uint, ctx context.Context) ([]uint, error) {
	args := m.Called(userID, ctx)
	return args.Get(0).([]uint), args.Error(1)
}

func (m *MockStatusRepo) IsMutualContact(userID uint, otherID uint, ctx context.Context) (bool, error) {
	args := m.Called(userID, otherID, ctx)
	return args.Bool(0), args.Error(1)
}

func (m *MockStatusRepo) CreateStatus(status *models.Status, ctx context.Context) error {
	args := m.Called(status, ctx)
	return args.Error(0)
}

func (m *MockStatusRepo) GetStatusByID(id uint, ctx context.Context) (*models.Status, error) {
	args := m.Called(id, ctx)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.Status), args.Error(1)
}

func (m *MockStatusRepo) GetActiveStatusesByUserIDs(userIDs []uint, ctx context.Context) ([]models.Status, error) {
	args := m.Called(userIDs, ctx)
	return args.Get(0).([]models.Status), args.Error(1)
}

func (m *MockStatusRepo) DeleteStatus(statusID uint, ownerID uint, ctx context.Context) error {
	args := m.Called(statusID, ownerID, ctx)
	return args.Error(0)
}

func (m *MockStatusRepo) CreateStatusView(statusID uint, viewerID uint, ctx context.Context) (bool, error) {
	args := m.Called(statusID, viewerID, ctx)
	return args.Bool(0), args.Error(1)
}

func (m *MockStatusRepo) GetStatusViewers(statusID uint, ctx context.Context) ([]models.StatusView, error) {
	args := m.Called(statusID, ctx)
	return args.Get(0).([]models.StatusView), args.Error(1)
}

func (m *MockStatusRepo) GetViewedStatusIDs(viewerID uint, statusIDs []uint, ctx context.Context) (map[uint]bool, error) {
	args := m.Called(viewerID, statusIDs, ctx)
	return args.Get(0).(map[uint]bool), args.Error(1)
}

func (m *MockStatusRepo) GetViewCounts(statusIDs []uint, ctx context.Context) (map[uint]int64, error) {
	args := m.Called(statusIDs, ctx)
	return args.Get(0).(map[uint]int64), args.Error(1)
}

func (m *MockStatusRepo) DeleteExpiredStatuses(ctx context.Context) (int64, error) {
	args := m.Called(ctx)
	return args.Get(0).(int64), args.Error(1)
}

// ==================== TESTS ====================

func TestInitServiceStatus(t *testing.T) {
	service := InitServiceStatus(nil)
	assert.NotNil(t, service)
}

func TestCreateStatusRejectsInvalidType(t *testing.T) {
	repo := new(MockStatusRepo)
	service := InitServiceStatus(repo)

	_, _, _, err := service.CreateStatus("12345678", models.StatusCreate{Type: "sticker"}, context.Background())

	assert.Error(t, err)
	repo.AssertNotCalled(t, "GetIdByTelephon", mock.Anything, mock.Anything)
}

func TestCreateStatusRejectsEmptyText(t *testing.T) {
	repo := new(MockStatusRepo)
	service := InitServiceStatus(repo)

	_, _, _, err := service.CreateStatus("12345678", models.StatusCreate{Type: "text", Text: "   "}, context.Background())

	assert.Error(t, err)
}

func TestCreateStatusRejectsInvalidHexColor(t *testing.T) {
	repo := new(MockStatusRepo)
	service := InitServiceStatus(repo)

	_, _, _, err := service.CreateStatus("12345678", models.StatusCreate{
		Type:            "text",
		Text:            "Hola",
		BackgroundColor: "not-a-color",
	}, context.Background())

	assert.Error(t, err)
}

func TestCreateStatusRejectsImageWithoutMediaUrl(t *testing.T) {
	repo := new(MockStatusRepo)
	service := InitServiceStatus(repo)

	_, _, _, err := service.CreateStatus("12345678", models.StatusCreate{Type: "image"}, context.Background())

	assert.Error(t, err)
}

func TestCreateStatusRejectsUnsafeMediaUrl(t *testing.T) {
	repo := new(MockStatusRepo)
	service := InitServiceStatus(repo)

	_, _, _, err := service.CreateStatus("12345678", models.StatusCreate{
		Type:     "image",
		MediaUrl: "javascript:alert(1)",
	}, context.Background())

	assert.Error(t, err)
}

func TestCreateStatusSuccessNotifiesMutualContacts(t *testing.T) {
	repo := new(MockStatusRepo)
	service := InitServiceStatus(repo)
	ctx := context.Background()

	repo.On("GetIdByTelephon", "12345678", ctx).Return(1, nil)
	repo.On("CreateStatus", mock.AnythingOfType("*models.Status"), ctx).
		Run(func(args mock.Arguments) {
			s := args.Get(0).(*models.Status)
			s.ID = 42
			s.CreatedAt = time.Now()
		}).Return(nil)
	repo.On("GetUsersBasicByIDs", []uint{1}, ctx).Return(map[uint]models.UserBasic{
		1: {ID: 1, Telephon: "12345678", Username: "owner", AvatarUrl: "avatar.png"},
	}, nil)
	repo.On("GetMutualContactIDs", uint(1), ctx).Return([]uint{2, 3}, nil)
	repo.On("GetUsersBasicByIDs", []uint{2, 3}, ctx).Return(map[uint]models.UserBasic{
		2: {ID: 2, Telephon: "22222222", Username: "b"},
		3: {ID: 3, Telephon: "33333333", Username: "c"},
	}, nil)

	item, owner, telephons, err := service.CreateStatus("12345678", models.StatusCreate{
		Type: "text",
		Text: "Hola mundo",
	}, ctx)

	assert.NoError(t, err)
	assert.Equal(t, uint(42), item.ID)
	assert.Equal(t, "owner", owner.Username)
	assert.ElementsMatch(t, []string{"22222222", "33333333"}, telephons)
	repo.AssertExpectations(t)
}

func TestMarkStatusViewedOwnerDoesNotCreateView(t *testing.T) {
	repo := new(MockStatusRepo)
	service := InitServiceStatus(repo)
	ctx := context.Background()

	repo.On("GetIdByTelephon", "12345678", ctx).Return(1, nil)
	repo.On("GetStatusByID", uint(42), ctx).Return(&models.Status{Model: gorm.Model{ID: 42}, UserID: 1}, nil)

	created, _, _, _, err := service.MarkStatusViewed("12345678", 42, ctx)

	assert.NoError(t, err)
	assert.False(t, created)
	repo.AssertNotCalled(t, "CreateStatusView", mock.Anything, mock.Anything, mock.Anything)
}

func TestMarkStatusViewedRejectsNonMutualContact(t *testing.T) {
	repo := new(MockStatusRepo)
	service := InitServiceStatus(repo)
	ctx := context.Background()

	repo.On("GetIdByTelephon", "22222222", ctx).Return(2, nil)
	repo.On("GetStatusByID", uint(42), ctx).Return(&models.Status{Model: gorm.Model{ID: 42}, UserID: 1}, nil)
	repo.On("IsMutualContact", uint(2), uint(1), ctx).Return(false, nil)

	_, _, _, _, err := service.MarkStatusViewed("22222222", 42, ctx)

	assert.Error(t, err)
	repo.AssertNotCalled(t, "CreateStatusView", mock.Anything, mock.Anything, mock.Anything)
}

func TestMarkStatusViewedSuccessIsIdempotent(t *testing.T) {
	repo := new(MockStatusRepo)
	service := InitServiceStatus(repo)
	ctx := context.Background()

	repo.On("GetIdByTelephon", "22222222", ctx).Return(2, nil)
	repo.On("GetStatusByID", uint(42), ctx).Return(&models.Status{Model: gorm.Model{ID: 42}, UserID: 1}, nil)
	repo.On("IsMutualContact", uint(2), uint(1), ctx).Return(true, nil)
	repo.On("CreateStatusView", uint(42), uint(2), ctx).Return(false, nil)
	repo.On("GetTelephonByID", uint(1), ctx).Return("11111111", nil)
	repo.On("GetViewCounts", []uint{42}, ctx).Return(map[uint]int64{42: 3}, nil)
	repo.On("GetUsersBasicByIDs", []uint{2}, ctx).Return(map[uint]models.UserBasic{
		2: {ID: 2, Telephon: "22222222", Username: "viewer"},
	}, nil)

	created, ownerTelephon, viewer, viewCount, err := service.MarkStatusViewed("22222222", 42, ctx)

	assert.NoError(t, err)
	assert.False(t, created)
	assert.Equal(t, "11111111", ownerTelephon)
	assert.Equal(t, "viewer", viewer.Username)
	assert.Equal(t, int64(3), viewCount)
}

func TestGetStatusViewersRejectsNonOwner(t *testing.T) {
	repo := new(MockStatusRepo)
	service := InitServiceStatus(repo)
	ctx := context.Background()

	repo.On("GetIdByTelephon", "22222222", ctx).Return(2, nil)
	repo.On("GetStatusByID", uint(42), ctx).Return(&models.Status{Model: gorm.Model{ID: 42}, UserID: 1}, nil)

	_, err := service.GetStatusViewers("22222222", 42, ctx)

	assert.Error(t, err)
}

func TestDeleteStatusPropagatesRepoNotFoundError(t *testing.T) {
	repo := new(MockStatusRepo)
	service := InitServiceStatus(repo)
	ctx := context.Background()

	repo.On("GetIdByTelephon", "22222222", ctx).Return(2, nil)
	repo.On("DeleteStatus", uint(42), uint(2), ctx).Return(errors.New("record not found"))

	_, err := service.DeleteStatus("22222222", 42, ctx)

	assert.Error(t, err)
}

func TestCleanupExpiredStatusesDelegatesToRepo(t *testing.T) {
	repo := new(MockStatusRepo)
	service := InitServiceStatus(repo)
	ctx := context.Background()

	repo.On("DeleteExpiredStatuses", ctx).Return(int64(5), nil)

	deleted, err := service.CleanupExpiredStatuses(ctx)

	assert.NoError(t, err)
	assert.Equal(t, int64(5), deleted)
}
