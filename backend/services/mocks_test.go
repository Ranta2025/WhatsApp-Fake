package services

import (
	"context"
	"gorm/backend/models"
	"gorm/backend/schemas"
	"time"

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

func (m *MockUserCache) DeleteActivationCode(username string, ctx context.Context) error {
	args := m.Called(username, ctx)
	return args.Error(0)
}

func (m *MockUserCache) ResetFailedAttempts(username string, ctx context.Context) error {
	args := m.Called(username, ctx)
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

func (m *MockContactRepo) GetTelephonByUsername(username string, ctx context.Context) (string, error) {
	args := m.Called(username, ctx)
	return args.String(0), args.Error(1)
}

func (m *MockContactRepo) GetUserDataBase(username string, ctx context.Context) (*schemas.UserGet, error) {
	args := m.Called(username, ctx)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*schemas.UserGet), args.Error(1)
}

func (m *MockContactRepo) RepoPutUser(username string, usernameUpdate string, ctx context.Context) error {
	args := m.Called(username, usernameUpdate, ctx)
	return args.Error(0)
}

func (m *MockContactRepo) RepoPutUserByTelephon(telephon string, usernameUpdate string, ctx context.Context) error {
	args := m.Called(telephon, usernameUpdate, ctx)
	return args.Error(0)
}

func (m *MockContactRepo) UpdateAvatarByTelephon(telephon string, avatarUrl string, ctx context.Context) error {
	args := m.Called(telephon, avatarUrl, ctx)
	return args.Error(0)
}

func (m *MockContactRepo) UpdateWallpaperByTelephon(telephon string, wallpaperUrl string, ctx context.Context) error {
	args := m.Called(telephon, wallpaperUrl, ctx)
	return args.Error(0)
}

func (m *MockContactRepo) UpdateContactWallpaper(myID uint, contactID uint, wallpaperUrl string, ctx context.Context) error {
	args := m.Called(myID, contactID, wallpaperUrl, ctx)
	return args.Error(0)
}

func (m *MockContactRepo) GetIdUsername(username string, ctx context.Context) (int, error) {
	args := m.Called(username, ctx)
	return args.Int(0), args.Error(1)
}

func (m *MockContactRepo) GetNumberUsername(number string, ctx context.Context) (int, error) {
	args := m.Called(number, ctx)
	return args.Int(0), args.Error(1)
}

func (m *MockContactRepo) ExistContactAdd(userID uint, contactID uint, ctx context.Context) (bool, error) {
	args := m.Called(userID, contactID, ctx)
	return args.Bool(0), args.Error(1)
}

func (m *MockContactRepo) ExistContactAddTx(tx *gorm.DB, userID uint, contactID uint, ctx context.Context) (bool, error) {
	args := m.Called(tx, userID, contactID, ctx)
	return args.Bool(0), args.Error(1)
}

func (m *MockContactRepo) AddContact(contact models.ContactDataBase, ctx context.Context) error {
	args := m.Called(contact, ctx)
	return args.Error(0)
}

func (m *MockContactRepo) AddContactTx(tx *gorm.DB, contact models.ContactDataBase, ctx context.Context) error {
	args := m.Called(tx, contact, ctx)
	return args.Error(0)
}

func (m *MockContactRepo) GetContactNumber(number string, ctx context.Context) (*models.ContactChat, error) {
	args := m.Called(number, ctx)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.ContactChat), args.Error(1)
}

func (m *MockContactRepo) GetContactsNumber(userID uint, ctx context.Context) (*[]models.ContactChat, error) {
	args := m.Called(userID, ctx)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*[]models.ContactChat), args.Error(1)
}

func (m *MockContactRepo) GetUsernameByTelephon(telephon string, ctx context.Context) (string, error) {
	args := m.Called(telephon, ctx)
	return args.String(0), args.Error(1)
}

func (m *MockContactRepo) GetIdByTelephon(telephon string, ctx context.Context) (int, error) {
	args := m.Called(telephon, ctx)
	return args.Int(0), args.Error(1)
}

func (m *MockContactRepo) PutContactByTelephon(userID uint, contactID uint, contactName string, ctx context.Context) error {
	args := m.Called(userID, contactID, contactName, ctx)
	return args.Error(0)
}

func (m *MockContactRepo) BeginTx() *gorm.DB {
	args := m.Called()
	if args.Get(0) == nil {
		return nil
	}
	return args.Get(0).(*gorm.DB)
}

func (m *MockContactRepo) InvalidateUserIDCache(telephon string, ctx context.Context) {
	m.Called(telephon, ctx)
}

func (m *MockContactRepo) InvalidateContactsCache(telephon string, ctx context.Context) {
	m.Called(telephon, ctx)
}

type MockTokenStore struct {
	mock.Mock
}

func (m *MockTokenStore) SaveRefreshToken(username string, token string, ctx context.Context) error {
	args := m.Called(username, token, ctx)
	return args.Error(0)
}

func (m *MockTokenStore) RotateRefreshToken(oldToken string, newToken string, username string, ctx context.Context) error {
	args := m.Called(oldToken, newToken, username, ctx)
	return args.Error(0)
}

func (m *MockTokenStore) ValidateRefreshToken(username string, token string, ctx context.Context) error {
	args := m.Called(username, token, ctx)
	return args.Error(0)
}

func (m *MockTokenStore) DeleteRefreshToken(username string, ctx context.Context) error {
	args := m.Called(username, ctx)
	return args.Error(0)
}

func (m *MockTokenStore) RevokeAllForUser(username string, ctx context.Context) error {
	args := m.Called(username, ctx)
	return args.Error(0)
}

func (m *MockTokenStore) IsBlacklisted(jti string, ctx context.Context) (bool, error) {
	args := m.Called(jti, ctx)
	return args.Bool(0), args.Error(1)
}

func (m *MockTokenStore) BlacklistToken(jti string, ttl time.Duration, ctx context.Context) error {
	args := m.Called(jti, ttl, ctx)
	return args.Error(0)
}
