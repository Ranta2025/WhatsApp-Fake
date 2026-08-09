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

type MockUserCache struct {
	mock.Mock
}

func (m *MockUserCache) SaveRefreshToken(username string, refreshToken string, ctx context.Context) error {
	args := m.Called(username, refreshToken, ctx)
	return args.Error(0)
}

func (m *MockUserCache) GetRefreshToken(username string, ctx context.Context) (string, error) {
	args := m.Called(username, ctx)
	return args.String(0), args.Error(1)
}

func (m *MockUserCache) DeleteRefreshToken(username string, ctx context.Context) error {
	args := m.Called(username, ctx)
	return args.Error(0)
}

func (m *MockUserCache) CachePassword(username string, ctx context.Context) (string, error) {
	args := m.Called(username, ctx)
	return args.String(0), args.Error(1)
}

func (m *MockUserCache) CacheActivo(username string, ctx context.Context) (bool, error) {
	args := m.Called(username, ctx)
	return args.Bool(0), args.Error(1)
}

func (m *MockUserCache) SetCodigo(tipoCodigo string, username string, codigo string, ctx context.Context) error {
	args := m.Called(tipoCodigo, username, codigo, ctx)
	return args.Error(0)
}

func (m *MockUserCache) GetCodigo(tipoCodigo string, username string, ctx context.Context) (string, error) {
	args := m.Called(tipoCodigo, username, ctx)
	return args.String(0), args.Error(1)
}

func (m *MockUserCache) GetIntentosFallidos(username string, ctx context.Context) (int, error) {
	args := m.Called(username, ctx)
	return args.Int(0), args.Error(1)
}

func (m *MockUserCache) IncrementFailedAttempts(username string, ctx context.Context) (int, error) {
	args := m.Called(username, ctx)
	return args.Int(0), args.Error(1)
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
