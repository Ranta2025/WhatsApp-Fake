package services

import (
	"context"
	"gorm/backend/models"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"gorm.io/gorm"
)

// MockCallRepo implementa CallRepoInterface para tests de ServiceCall.
type MockCallRepo struct {
	mock.Mock
}

func (m *MockCallRepo) GetIdByTelephon(telephon string, ctx context.Context) (int, error) {
	args := m.Called(telephon, ctx)
	return args.Int(0), args.Error(1)
}

func (m *MockCallRepo) CreateCallLog(call *models.CallLog, ctx context.Context) error {
	args := m.Called(call, ctx)
	return args.Error(0)
}

func (m *MockCallRepo) GetTelephonByID(id uint, ctx context.Context) (string, error) {
	args := m.Called(id, ctx)
	return args.String(0), args.Error(1)
}

func (m *MockCallRepo) UpdateCallLogByRoomID(roomID string, data map[string]interface{}, ctx context.Context) error {
	args := m.Called(roomID, data, ctx)
	return args.Error(0)
}

func (m *MockCallRepo) GetCallLogsByUser(userID uint, ctx context.Context) ([]models.CallLog, error) {
	args := m.Called(userID, ctx)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]models.CallLog), args.Error(1)
}

func (m *MockCallRepo) GetUserByID(userID uint, ctx context.Context) (*models.UserDataBase, error) {
	args := m.Called(userID, ctx)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.UserDataBase), args.Error(1)
}

func (m *MockCallRepo) GetUserByIDs(ids []uint, ctx context.Context) (map[uint]*models.UserDataBase, error) {
	args := m.Called(ids, ctx)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(map[uint]*models.UserDataBase), args.Error(1)
}

func (m *MockCallRepo) DeleteCallLogForUser(callID uint, userID uint, ctx context.Context) error {
	args := m.Called(callID, userID, ctx)
	return args.Error(0)
}

// ==================== R4/N+1: batch fetch en GetCallHistory ====================

// TestGetCallHistoryUsesBatchFetch: el historial de llamadas debe resolver
// caller/receiver con UNA consulta batch (GetUserByIDs) y NUNCA con
// GetUserByID por registro (regresión contra el N+1, spec R4).
func TestGetCallHistoryUsesBatchFetch(t *testing.T) {
	ctx := context.Background()
	repo := &MockCallRepo{}
	service := InitServiceCall(repo)

	now := time.Now()
	repo.On("GetIdByTelephon", "+111", ctx).Return(1, nil)
	repo.On("GetCallLogsByUser", uint(1), ctx).Return([]models.CallLog{
		{
			Model:      gorm.Model{ID: 10},
			CallerID:   1,
			ReceiverID: 2,
			CallType:   "audio",
			Status:     "answered",
			StartedAt:  now,
			AnsweredAt: &now,
			EndedAt:    &now,
		},
		{
			Model:      gorm.Model{ID: 11},
			CallerID:   3,
			ReceiverID: 1,
			CallType:   "video",
			Status:     "missed",
			StartedAt:  now,
		},
	}, nil)
	// El orden de ids proviene de un map: expectativa como conjunto.
	repo.On("GetUserByIDs", mock.MatchedBy(func(ids []uint) bool {
		return len(ids) == 3 &&
			((ids[0] == 1 && ids[1] == 2 && ids[2] == 3) ||
				(ids[0] == 1 && ids[1] == 3 && ids[2] == 2) ||
				(ids[0] == 2 && ids[1] == 1 && ids[2] == 3) ||
				(ids[0] == 2 && ids[1] == 3 && ids[2] == 1) ||
				(ids[0] == 3 && ids[1] == 1 && ids[2] == 2) ||
				(ids[0] == 3 && ids[1] == 2 && ids[2] == 1))
	}), ctx).Return(map[uint]*models.UserDataBase{
		1: {User: models.User{Model: gorm.Model{ID: 1}, Username: "yo", Telephon: "+111"}},
		2: {User: models.User{Model: gorm.Model{ID: 2}, Username: "pepe", Telephon: "+222"}},
		3: {User: models.User{Model: gorm.Model{ID: 3}, Username: "juan", Telephon: "+333"}},
	}, nil)

	history, err := service.GetCallHistory("+111", ctx)

	assert.NoError(t, err)
	assert.Len(t, history, 2)
	repo.AssertCalled(t, "GetUserByIDs", mock.Anything, ctx)
	repo.AssertNotCalled(t, "GetUserByID", mock.Anything, ctx)

	// history se ordena por ID de llamada (10, 11) en el orden del repo.
	first := history[0]
	if first.ID == 11 {
		first = history[1]
	}
	assert.Equal(t, "pepe", first.ReceiverUsername)
	assert.Equal(t, "+222", first.ReceiverTelephon)
	assert.True(t, first.IsOutgoing)
	second := history[0]
	if second.ID == 10 {
		second = history[1]
	}
	assert.Equal(t, "juan", second.CallerUsername)
	assert.False(t, second.IsOutgoing)
}
