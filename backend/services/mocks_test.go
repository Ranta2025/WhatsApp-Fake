package services

import (
	"context"
	"gorm/backend/models"
	"gorm/backend/schemas"

	"github.com/stretchr/testify/mock"
	"gorm.io/gorm"
)

type MockUserRepo struct {
	mock.Mock
}

func (m *MockUserRepo) UsernameExist(username string, ctx context.Context) bool {
	args := m.Called(username, ctx)
	return args.Bool(0)
}

func (m *MockUserRepo) EmailExist(email string, ctx context.Context) (string, bool) {
	args := m.Called(email, ctx)
	return args.String(0), args.Bool(1)
}

func (m *MockUserRepo) TelephonExist(telephon string, ctx context.Context) bool {
	args := m.Called(telephon, ctx)
	return args.Bool(0)
}

func (m *MockUserRepo) BeginTx() *gorm.DB {
	args := m.Called()
	return args.Get(0).(*gorm.DB)
}

func (m *MockUserRepo) CreateUserTx(tx *gorm.DB, user models.UserDataBase, ctx context.Context) error {
	args := m.Called(tx, user, ctx)
	return args.Error(0)
}

func (m *MockUserRepo) GetActivo(username string, ctx context.Context) (bool, bool) {
	args := m.Called(username, ctx)
	return args.Bool(0), args.Bool(1)
}

func (m *MockUserRepo) GetBlocked(username string, ctx context.Context) (bool, bool) {
	args := m.Called(username, ctx)
	return args.Bool(0), args.Bool(1)
}

func (m *MockUserRepo) GetPassword(username string, ctx context.Context) (string, bool) {
	args := m.Called(username, ctx)
	return args.String(0), args.Bool(1)
}

func (m *MockUserRepo) GetTelephonByUsername(username string, ctx context.Context) (string, bool) {
	args := m.Called(username, ctx)
	return args.String(0), args.Bool(1)
}

func (m *MockUserRepo) ActivateAccount(username string, ctx context.Context) error {
	args := m.Called(username, ctx)
	return args.Error(0)
}

func (m *MockUserRepo) GetGmail(username string, ctx context.Context) (string, bool) {
	args := m.Called(username, ctx)
	return args.String(0), args.Bool(1)
}

func (m *MockUserRepo) authResult(args mock.Arguments) (*models.UserAuth, error) {
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.UserAuth), args.Error(1)
}

func (m *MockUserRepo) GetAuthByUsername(username string, ctx context.Context) (*models.UserAuth, error) {
	return m.authResult(m.Called(username, ctx))
}

func (m *MockUserRepo) GetAuthByTelephon(telephon string, ctx context.Context) (*models.UserAuth, error) {
	return m.authResult(m.Called(telephon, ctx))
}

func (m *MockUserRepo) GetAuthByEmail(email string, ctx context.Context) (*models.UserAuth, error) {
	return m.authResult(m.Called(email, ctx))
}

type MockUserCache struct {
	mock.Mock
}

func (m *MockUserCache) SaveRefreshToken(telephon string, refreshToken string, ctx context.Context) error {
	return m.Called(telephon, refreshToken, ctx).Error(0)
}

func (m *MockUserCache) ConsumeRefreshToken(refreshToken string, ctx context.Context) (string, error) {
	args := m.Called(refreshToken, ctx)
	return args.String(0), args.Error(1)
}

func (m *MockUserCache) DeleteRefreshToken(refreshToken string, ctx context.Context) error {
	return m.Called(refreshToken, ctx).Error(0)
}

func (m *MockUserCache) RevokeAllRefreshTokens(telephon string, ctx context.Context) error {
	return m.Called(telephon, ctx).Error(0)
}

func (m *MockUserCache) SetCodigo(tipoCodigo string, key string, codigo string, ctx context.Context) error {
	return m.Called(tipoCodigo, key, codigo, ctx).Error(0)
}

func (m *MockUserCache) GetCodigo(tipoCodigo string, key string, ctx context.Context) (string, error) {
	args := m.Called(tipoCodigo, key, ctx)
	return args.String(0), args.Error(1)
}

func (m *MockUserCache) DeleteCodigo(tipoCodigo string, key string, ctx context.Context) error {
	return m.Called(tipoCodigo, key, ctx).Error(0)
}

func (m *MockUserCache) IncrCodigoIntentos(tipoCodigo string, key string, ctx context.Context) (int, error) {
	args := m.Called(tipoCodigo, key, ctx)
	return args.Int(0), args.Error(1)
}

func (m *MockUserCache) IncrIntentosFallidos(username string, ctx context.Context) (int, error) {
	args := m.Called(username, ctx)
	return args.Int(0), args.Error(1)
}

func (m *MockUserCache) ResetIntentosFallidos(username string, ctx context.Context) error {
	return m.Called(username, ctx).Error(0)
}

func (m *MockUserRepo) BlockUser(username string, ctx context.Context) error {
	args := m.Called(username, ctx)
	return args.Error(0)
}

func (m *MockUserRepo) UnblockUserByEmail(email string, ctx context.Context) error {
	args := m.Called(email, ctx)
	return args.Error(0)
}

func (m *MockUserRepo) ChangePasswordByEmail(email, password string, ctx context.Context) error {
	args := m.Called(email, password, ctx)
	return args.Error(0)
}

func (m *MockUserRepo) ChangePasswordByEmailTx(tx *gorm.DB, email, password string, ctx context.Context) error {
	args := m.Called(tx, email, password, ctx)
	return args.Error(0)
}

func (m *MockUserRepo) UnblockUserByEmailTx(tx *gorm.DB, email string, ctx context.Context) error {
	args := m.Called(tx, email, ctx)
	return args.Error(0)
}

type MockChatRepo struct {
	mock.Mock
}

// ... resto del archivo

func (m *MockChatRepo) GetIdByTelephon(telephon string, ctx context.Context) (int, error) {
	args := m.Called(telephon, ctx)
	return args.Int(0), args.Error(1)
}

func (m *MockChatRepo) CreateMessage(msg *models.Message, ctx context.Context) error {
	args := m.Called(msg, ctx)
	return args.Error(0)
}

func (m *MockChatRepo) GetMessages(id1, id2 uint, ctx context.Context) ([]models.Message, error) {
	args := m.Called(id1, id2, ctx)
	return args.Get(0).([]models.Message), args.Error(1)
}

func (m *MockChatRepo) GetMessagesPage(id1, id2, before uint, limit int, ctx context.Context) ([]models.Message, bool, error) {
	args := m.Called(id1, id2, before, limit, ctx)
	return args.Get(0).([]models.Message), args.Bool(1), args.Error(2)
}

type MockContactRepo struct {
	mock.Mock
}

func (m *MockContactRepo) GetUserDataBaseByTelephon(telephon string, ctx context.Context) (*schemas.UserGet, error) {
	args := m.Called(telephon, ctx)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*schemas.UserGet), args.Error(1)
}

// MockPushRepo implementa PushRepoInterface para los tests del servicio de Web Push.
type MockPushRepo struct {
	mock.Mock
}

func (m *MockPushRepo) GetIdByTelephon(telephon string, ctx context.Context) (int, error) {
	args := m.Called(telephon, ctx)
	return args.Int(0), args.Error(1)
}

func (m *MockPushRepo) UpsertSubscription(sub *models.PushSubscription, ctx context.Context) (bool, error) {
	args := m.Called(sub, ctx)
	return args.Bool(0), args.Error(1)
}

func (m *MockPushRepo) ListSubscriptionsByUser(userID uint, ctx context.Context) ([]models.PushSubscription, error) {
	args := m.Called(userID, ctx)
	return args.Get(0).([]models.PushSubscription), args.Error(1)
}

func (m *MockPushRepo) DeleteSubscriptionByEndpoint(userID uint, endpoint string, ctx context.Context) error {
	args := m.Called(userID, endpoint, ctx)
	return args.Error(0)
}

func (m *MockPushRepo) GetSubscriptionByEndpoint(endpoint string, ctx context.Context) (*models.PushSubscription, error) {
	args := m.Called(endpoint, ctx)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.PushSubscription), args.Error(1)
}

func (m *MockPushRepo) DeleteSubscriptionByID(id uint, ctx context.Context) error {
	args := m.Called(id, ctx)
	return args.Error(0)
}

func (m *MockPushRepo) GetPushPreviewDisabled(userID uint, ctx context.Context) (bool, error) {
	args := m.Called(userID, ctx)
	return args.Bool(0), args.Error(1)
}

func (m *MockPushRepo) SetPushPreviewDisabled(userID uint, disabled bool, ctx context.Context) error {
	args := m.Called(userID, disabled, ctx)
	return args.Error(0)
}
