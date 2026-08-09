package handlers

import (
	"context"
	"gorm/backend/models"
	"gorm/backend/schemas"
	"gorm/backend/services"
	"mime/multipart"

	"github.com/stretchr/testify/mock"
	"gorm.io/gorm"
)

type MockRepositoriesUser struct {
	mock.Mock
}

func (m *MockRepositoriesUser) UsernameExist(username string, ctx context.Context) bool {
	args := m.Called(username, ctx)
	return args.Bool(0)
}

func (m *MockRepositoriesUser) EmailExist(email string, ctx context.Context) (string, bool) {
	args := m.Called(email, ctx)
	return args.String(0), args.Bool(1)
}

func (m *MockRepositoriesUser) TelephonExist(telephon string, ctx context.Context) bool {
	args := m.Called(telephon, ctx)
	return args.Bool(0)
}

func (m *MockRepositoriesUser) CreateUserTx(tx *gorm.DB, user models.UserDataBase, ctx context.Context) error {
	args := m.Called(tx, user, ctx)
	return args.Error(0)
}

func (m *MockRepositoriesUser) BeginTx() *gorm.DB {
	args := m.Called()
	return args.Get(0).(*gorm.DB)
}

func (m *MockRepositoriesUser) GetActivo(username string, ctx context.Context) (bool, bool) {
	args := m.Called(username, ctx)
	return args.Bool(0), args.Bool(1)
}

func (m *MockRepositoriesUser) GetBlocked(username string, ctx context.Context) (bool, bool) {
	args := m.Called(username, ctx)
	return args.Bool(0), args.Bool(1)
}

func (m *MockRepositoriesUser) GetTelephonByUsername(username string, ctx context.Context) (string, bool) {
	args := m.Called(username, ctx)
	return args.String(0), args.Bool(1)
}

type MockCacheUser struct {
	mock.Mock
}

func (m *MockCacheUser) SetCodigo(tipo, username, codigo string, ctx context.Context) error {
	args := m.Called(tipo, username, codigo, ctx)
	return args.Error(0)
}

func (m *MockCacheUser) CachePassword(username string, ctx context.Context) (string, error) {
	args := m.Called(username, ctx)
	return args.String(0), args.Error(1)
}

type MockChatRepo struct {
	mock.Mock
}

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

type MockUserService struct {
	mock.Mock
}

func (m *MockUserService) CreateUser(user models.UserDataBase, ctx context.Context) error {
	args := m.Called(user, ctx)
	return args.Error(0)
}

func (m *MockUserService) LogIn(user models.UserLogin, ctx context.Context) (string, error) {
	args := m.Called(user, ctx)
	return args.String(0), args.Error(1)
}

func (m *MockUserService) ActivateAccount(user models.UserActivate, ctx context.Context) error {
	args := m.Called(user, ctx)
	return args.Error(0)
}

func (m *MockUserService) RecoverAccount(username string, ctx context.Context) (string, error) {
	args := m.Called(username, ctx)
	return args.String(0), args.Error(1)
}

func (m *MockUserService) ResendCode(gmail string, ctx context.Context) error {
	args := m.Called(gmail, ctx)
	return args.Error(0)
}

func (m *MockUserService) RecoverCuenta(user models.UserRecover, ctx context.Context) error {
	args := m.Called(user, ctx)
	return args.Error(0)
}

func (m *MockUserService) ChangePassword(user models.UserChangePassword, ctx context.Context) error {
	args := m.Called(user, ctx)
	return args.Error(0)
}

func (m *MockUserService) SendForgotPasswordCode(email string, ctx context.Context) error {
	args := m.Called(email, ctx)
	return args.Error(0)
}

func (m *MockUserService) ForgotPasswordChange(email, code, newPassword string, ctx context.Context) error {
	args := m.Called(email, code, newPassword, ctx)
	return args.Error(0)
}

func (m *MockUserService) RecoverAndChangePassword(email, code, newPassword string, ctx context.Context) error {
	args := m.Called(email, code, newPassword, ctx)
	return args.Error(0)
}

func (m *MockUserService) GetTelephonByUsername(username string, ctx context.Context) (string, bool) {
	args := m.Called(username, ctx)
	return args.String(0), args.Bool(1)
}

func (m *MockUserService) SaveRefreshToken(username string, refreshToken string, ctx context.Context) error {
	args := m.Called(username, refreshToken, ctx)
	return args.Error(0)
}

func (m *MockUserService) ValidateRefreshToken(username string, refreshToken string, ctx context.Context) error {
	args := m.Called(username, refreshToken, ctx)
	return args.Error(0)
}

func (m *MockUserService) DeleteRefreshToken(username string, ctx context.Context) error {
	args := m.Called(username, ctx)
	return args.Error(0)
}

func (m *MockUserService) RotateRefreshToken(oldToken string, newToken string, username string, ctx context.Context) error {
	args := m.Called(oldToken, newToken, username, ctx)
	return args.Error(0)
}

type MockChatService struct {
	mock.Mock
}

func (m *MockChatService) ServiceCreatMessage(message models.MessageCreat, ctx context.Context) (schemas.Message, error) {
	args := m.Called(message, ctx)
	return args.Get(0).(schemas.Message), args.Error(1)
}

func (m *MockChatService) ServiceCreatMessageWithStatus(message models.MessageCreat, status string, ctx context.Context) (schemas.Message, error) {
	args := m.Called(message, status, ctx)
	return args.Get(0).(schemas.Message), args.Error(1)
}

func (m *MockChatService) ServiceGetMessages(telephonUser string, telephonContact string, ctx context.Context) ([]schemas.Message, error) {
	args := m.Called(telephonUser, telephonContact, ctx)
	return args.Get(0).([]schemas.Message), args.Error(1)
}

func (m *MockChatService) ServicePutMessageStatusDelivered(telephonSender string, telephonReceiver string, ctx context.Context) error {
	args := m.Called(telephonSender, telephonReceiver, ctx)
	return args.Error(0)
}

func (m *MockChatService) ServicePutAllMessageStatusDelivered(telephon string, ctx context.Context) error {
	args := m.Called(telephon, ctx)
	return args.Error(0)
}

func (m *MockChatService) ServiceGetSendersAndMarkDelivered(telephon string, ctx context.Context) ([]string, error) {
	args := m.Called(telephon, ctx)
	return args.Get(0).([]string), args.Error(1)
}

func (m *MockChatService) ServiceGetAllChats(telephonUser string, ctx context.Context) ([]schemas.ChatGroup, error) {
	args := m.Called(telephonUser, ctx)
	return args.Get(0).([]schemas.ChatGroup), args.Error(1)
}

func (m *MockChatService) ServiceEditMessage(telephonSender string, messageID uint, newContent string, ctx context.Context) (schemas.Message, error) {
	args := m.Called(telephonSender, messageID, newContent, ctx)
	return args.Get(0).(schemas.Message), args.Error(1)
}

func (m *MockChatService) ServiceDeleteMessage(telephonSender string, messageID uint, ctx context.Context) (schemas.Message, error) {
	args := m.Called(telephonSender, messageID, ctx)
	return args.Get(0).(schemas.Message), args.Error(1)
}

func (m *MockChatService) ServiceClearChat(telephonUser string, telephonContact string, ctx context.Context) error {
	args := m.Called(telephonUser, telephonContact, ctx)
	return args.Error(0)
}

func (m *MockChatService) ServiceDeleteMessageForMe(telephonUser string, messageID uint, ctx context.Context) (schemas.Message, error) {
	args := m.Called(telephonUser, messageID, ctx)
	return args.Get(0).(schemas.Message), args.Error(1)
}

type MockContactService struct {
	mock.Mock
}

func (m *MockContactService) GetTelephonByUsername(username string, ctx context.Context) (string, error) {
	args := m.Called(username, ctx)
	return args.String(0), args.Error(1)
}

func (m *MockContactService) ServicesGetUser(username string, ctx context.Context) (*schemas.UserGet, error) {
	args := m.Called(username, ctx)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*schemas.UserGet), args.Error(1)
}

func (m *MockContactService) ServicePutUser(username string, usernameUpdate string, ctx context.Context) (*schemas.UserGet, error) {
	args := m.Called(username, usernameUpdate, ctx)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*schemas.UserGet), args.Error(1)
}

func (m *MockContactService) AddContact(username string, contactAdd models.ContactAdd, ctx context.Context) (*models.ContactChat, error) {
	args := m.Called(username, contactAdd, ctx)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.ContactChat), args.Error(1)
}

func (m *MockContactService) ServiceGetContacts(username string, ctx context.Context) (*[]models.ContactChat, error) {
	args := m.Called(username, ctx)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*[]models.ContactChat), args.Error(1)
}

func (m *MockContactService) ServicesGetUserByTelephon(telephon string, ctx context.Context) (*schemas.UserGet, error) {
	args := m.Called(telephon, ctx)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*schemas.UserGet), args.Error(1)
}

func (m *MockContactService) ServicePutUserByTelephon(telephon string, usernameUpdate string, ctx context.Context) (*schemas.UserGet, string, error) {
	args := m.Called(telephon, usernameUpdate, ctx)
	if args.Get(0) == nil {
		return nil, args.String(1), args.Error(2)
	}
	return args.Get(0).(*schemas.UserGet), args.String(1), args.Error(2)
}

func (m *MockContactService) AddContactByTelephon(telephon string, contactAdd models.ContactAdd, ctx context.Context) (*models.ContactChat, error) {
	args := m.Called(telephon, contactAdd, ctx)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.ContactChat), args.Error(1)
}

func (m *MockContactService) ServiceGetContactsByTelephon(telephon string, ctx context.Context) (*[]models.ContactChat, error) {
	args := m.Called(telephon, ctx)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*[]models.ContactChat), args.Error(1)
}

func (m *MockContactService) ServicePutContactByTelephon(contact models.ContactPut, ctx context.Context) (*models.ContactChat, error) {
	args := m.Called(contact, ctx)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.ContactChat), args.Error(1)
}

func (m *MockContactService) ServiceUpdateUsername(telephon string, usernameUpdate string, ctx context.Context) (*schemas.UserGet, string, string, error) {
	args := m.Called(telephon, usernameUpdate, ctx)
	if args.Get(0) == nil {
		return nil, args.String(1), args.String(2), args.Error(3)
	}
	return args.Get(0).(*schemas.UserGet), args.String(1), args.String(2), args.Error(3)
}

func (m *MockContactService) ServiceUpdateAvatar(telephon string, avatarUrl string, ctx context.Context) error {
	args := m.Called(telephon, avatarUrl, ctx)
	return args.Error(0)
}

func (m *MockContactService) ServiceUpdateWallpaper(telephon string, wallpaperUrl string, ctx context.Context) error {
	args := m.Called(telephon, wallpaperUrl, ctx)
	return args.Error(0)
}

func (m *MockContactService) ServiceUpdateContactWallpaper(myTelephon string, contactTelephon string, wallpaperUrl string, ctx context.Context) error {
	args := m.Called(myTelephon, contactTelephon, wallpaperUrl, ctx)
	return args.Error(0)
}

type MockBugReportService struct {
	mock.Mock
}

func (m *MockBugReportService) CreateGitHubIssue(report models.BugReport) error {
	args := m.Called(report)
	return args.Error(0)
}

type MockCallService struct {
	mock.Mock
}

func (m *MockCallService) CreateCallLog(callerTelephon, receiverTelephon, roomID, callType string, ctx context.Context) error {
	args := m.Called(callerTelephon, receiverTelephon, roomID, callType, ctx)
	return args.Error(0)
}

func (m *MockCallService) MarkCallAnswered(roomID string, ctx context.Context) error {
	args := m.Called(roomID, ctx)
	return args.Error(0)
}

func (m *MockCallService) MarkCallRejected(roomID string, ctx context.Context) error {
	args := m.Called(roomID, ctx)
	return args.Error(0)
}

func (m *MockCallService) MarkCallUnavailable(roomID string, ctx context.Context) error {
	args := m.Called(roomID, ctx)
	return args.Error(0)
}

func (m *MockCallService) MarkCallEnded(roomID string, ctx context.Context) error {
	args := m.Called(roomID, ctx)
	return args.Error(0)
}

func (m *MockCallService) GetCallHistory(telephon string, ctx context.Context) ([]schemas.CallLogResponse, error) {
	args := m.Called(telephon, ctx)
	return args.Get(0).([]schemas.CallLogResponse), args.Error(1)
}

func (m *MockCallService) DeleteCallForUser(callID uint, telephon string, ctx context.Context) error {
	args := m.Called(callID, telephon, ctx)
	return args.Error(0)
}

type MockMediaService struct {
	mock.Mock
}

func (m *MockMediaService) UploadMedia(file multipart.File, header *multipart.FileHeader, ctx context.Context) (services.MediaUploadResult, error) {
	args := m.Called(file, header, ctx)
	return args.Get(0).(services.MediaUploadResult), args.Error(1)
}
