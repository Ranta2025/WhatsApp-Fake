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

func (m *MockUserService) RefreshSession(refreshToken string, ctx context.Context) (string, string, error) {
	args := m.Called(refreshToken, ctx)
	return args.String(0), args.String(1), args.Error(2)
}

func (m *MockUserService) DeleteRefreshToken(username string, ctx context.Context) error {
	args := m.Called(username, ctx)
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

func (m *MockChatService) ServiceSearchMessages(telephonUser, telephonContact, q string, before uint, limit int, ctx context.Context) (*schemas.SearchPage, error) {
	args := m.Called(telephonUser, telephonContact, q, before, limit, ctx)
	return args.Get(0).(*schemas.SearchPage), args.Error(1)
}

func (m *MockChatService) ServiceGetMessagesAround(telephonUser, telephonContact string, around uint, limit int, ctx context.Context) ([]schemas.Message, bool, bool, error) {
	args := m.Called(telephonUser, telephonContact, around, limit, ctx)
	return args.Get(0).([]schemas.Message), args.Bool(1), args.Bool(2), args.Error(3)
}

func (m *MockChatService) ServiceGetMessagesAfter(telephonUser, telephonContact string, after uint, limit int, ctx context.Context) ([]schemas.Message, bool, error) {
	args := m.Called(telephonUser, telephonContact, after, limit, ctx)
	return args.Get(0).([]schemas.Message), args.Bool(1), args.Error(2)
}

func (m *MockChatService) ServiceGetMessagesPage(telephonUser string, telephonContact string, before uint, limit int, ctx context.Context) ([]schemas.Message, bool, error) {
	args := m.Called(telephonUser, telephonContact, before, limit, ctx)
	return args.Get(0).([]schemas.Message), args.Bool(1), args.Error(2)
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

func (m *MockCallService) MarkCallAnswered(roomID string, telephon string, ctx context.Context) error {
	args := m.Called(roomID, telephon, ctx)
	return args.Error(0)
}

func (m *MockCallService) MarkCallRejected(roomID string, telephon string, ctx context.Context) error {
	args := m.Called(roomID, telephon, ctx)
	return args.Error(0)
}

func (m *MockCallService) MarkCallUnavailable(roomID string, telephon string, ctx context.Context) error {
	args := m.Called(roomID, telephon, ctx)
	return args.Error(0)
}

func (m *MockCallService) MarkCallEnded(roomID string, telephon string, ctx context.Context) error {
	args := m.Called(roomID, telephon, ctx)
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

type MockStatusService struct {
	mock.Mock
}

func (m *MockStatusService) CreateStatus(telephon string, input models.StatusCreate, ctx context.Context) (schemas.StatusItem, schemas.StatusOwnerBrief, []string, error) {
	args := m.Called(telephon, input, ctx)
	return args.Get(0).(schemas.StatusItem), args.Get(1).(schemas.StatusOwnerBrief), args.Get(2).([]string), args.Error(3)
}

func (m *MockStatusService) GetFeed(telephon string, ctx context.Context) (schemas.StatusFeed, error) {
	args := m.Called(telephon, ctx)
	return args.Get(0).(schemas.StatusFeed), args.Error(1)
}

func (m *MockStatusService) MarkStatusViewed(telephon string, statusID uint, ctx context.Context) (bool, string, schemas.StatusViewer, int64, error) {
	args := m.Called(telephon, statusID, ctx)
	return args.Bool(0), args.String(1), args.Get(2).(schemas.StatusViewer), args.Get(3).(int64), args.Error(4)
}

func (m *MockStatusService) GetStatusViewers(telephon string, statusID uint, ctx context.Context) ([]schemas.StatusViewer, error) {
	args := m.Called(telephon, statusID, ctx)
	return args.Get(0).([]schemas.StatusViewer), args.Error(1)
}

func (m *MockStatusService) DeleteStatus(telephon string, statusID uint, ctx context.Context) ([]string, error) {
	args := m.Called(telephon, statusID, ctx)
	return args.Get(0).([]string), args.Error(1)
}

func (m *MockStatusService) CleanupExpiredStatuses(ctx context.Context) (int64, error) {
	args := m.Called(ctx)
	return args.Get(0).(int64), args.Error(1)
}

func (m *MockChatService) SetChatDisappearing(actorTelephon, contactTelephon string, seconds int, ctx context.Context) (bool, *schemas.Message, error) {
	args := m.Called(actorTelephon, contactTelephon, seconds, ctx)
	msg, _ := args.Get(1).(*schemas.Message)
	return args.Bool(0), msg, args.Error(2)
}

func (m *MockChatService) GetChatDisappearing(actorTelephon, contactTelephon string, ctx context.Context) (int, error) {
	args := m.Called(actorTelephon, contactTelephon, ctx)
	return args.Int(0), args.Error(1)
}

// MockPushService implementa services.PushServicer para los tests del handler de push.
type MockPushService struct {
	mock.Mock
}

func (m *MockPushService) Config(telephon string, ctx context.Context) (schemas.PushConfigResponse, error) {
	args := m.Called(telephon, ctx)
	return args.Get(0).(schemas.PushConfigResponse), args.Error(1)
}

func (m *MockPushService) Subscribe(telephon string, input models.PushSubscriptionInput, userAgent string, ctx context.Context) (bool, error) {
	args := m.Called(telephon, input, userAgent, ctx)
	return args.Bool(0), args.Error(1)
}

func (m *MockPushService) Unsubscribe(telephon string, endpoint string, ctx context.Context) error {
	args := m.Called(telephon, endpoint, ctx)
	return args.Error(0)
}

func (m *MockPushService) SetPreview(telephon string, preview bool, ctx context.Context) error {
	args := m.Called(telephon, preview, ctx)
	return args.Error(0)
}

// MockMuteService implementa services.MuteServicer para los tests del
// silencio por chat y de los listados que muestran el estado de silencio.
type MockMuteService struct {
	mock.Mock
}

func (m *MockMuteService) SetMute(telephon string, target services.MuteTarget, duration string, ctx context.Context) (schemas.MuteResponse, error) {
	args := m.Called(telephon, target, duration, ctx)
	return args.Get(0).(schemas.MuteResponse), args.Error(1)
}

func (m *MockMuteService) ClearMute(telephon string, target services.MuteTarget, ctx context.Context) error {
	args := m.Called(telephon, target, ctx)
	return args.Error(0)
}

func (m *MockMuteService) DecorateChats(telephon string, chats []schemas.ChatGroup, ctx context.Context) error {
	args := m.Called(telephon, chats, ctx)
	return args.Error(0)
}

func (m *MockMuteService) DecorateContacts(telephon string, contacts []models.ContactChat, ctx context.Context) error {
	args := m.Called(telephon, contacts, ctx)
	return args.Error(0)
}

func (m *MockMuteService) DecorateGroups(telephon string, groups []schemas.GroupResponse, ctx context.Context) error {
	args := m.Called(telephon, groups, ctx)
	return args.Error(0)
}
