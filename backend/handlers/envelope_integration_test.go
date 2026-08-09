package handlers

import (
	"bytes"
	"context"
	"errors"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"gorm/backend/models"
	"gorm/backend/schemas"
	"gorm/backend/services"
	"gorm/backend/utils"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

// ─────────────────────────────────────────────────────────────────────────────
// Stubs para GroupServicer y StatusServicer (solo ejercitan el handler).
// ─────────────────────────────────────────────────────────────────────────────

type stubGroupService struct {
	err error
}

func (s stubGroupService) CreateGroup(string, models.GroupCreate, context.Context) (*schemas.GroupDetail, error) {
	return nil, s.err
}
func (s stubGroupService) AddMembers(string, uint, models.GroupAddMembers, context.Context) error { return s.err }
func (s stubGroupService) GetUserGroups(string, context.Context) ([]schemas.GroupResponse, error)  { return nil, s.err }
func (s stubGroupService) GetGroupDetail(string, uint, context.Context) (*schemas.GroupDetail, error) {
	return nil, s.err
}
func (s stubGroupService) SendGroupMessage(string, models.GroupMessageSend, context.Context) (*schemas.GroupMessageResponse, error) {
	return nil, s.err
}
func (s stubGroupService) GetGroupMessages(string, uint, int, int, context.Context) ([]schemas.GroupMessageResponse, error) {
	return nil, s.err
}
func (s stubGroupService) EditGroupMessage(string, uint, models.GroupMessageEdit, context.Context) (*schemas.GroupMessageResponse, error) {
	return nil, s.err
}
func (s stubGroupService) DeleteGroupMessage(string, uint, models.GroupMessageDelete, context.Context) error { return s.err }
func (s stubGroupService) GetMemberTelephons(uint, context.Context) ([]string, error)                       { return nil, s.err }
func (s stubGroupService) LeaveGroup(string, uint, context.Context) (string, error)                         { return "", s.err }
func (s stubGroupService) UpdateGroupAvatar(string, uint, string, context.Context) error                     { return s.err }
func (s stubGroupService) GetUsernameByTelephon(string, context.Context) (string, error)                    { return "", s.err }
func (s stubGroupService) SetMemberRole(string, uint, models.GroupSetRole, context.Context) error           { return s.err }
func (s stubGroupService) RemoveMember(string, uint, models.GroupRemoveMember, context.Context) error       { return s.err }
func (s stubGroupService) UpdateGroupDescription(string, uint, string, context.Context) error               { return s.err }

type stubStatusService struct {
	err error
}

func (s stubStatusService) CreateStatus(string, models.StatusCreate, context.Context) (*models.Status, error) {
	return nil, s.err
}
func (s stubStatusService) GetFeed(string, context.Context) (*models.StatusFeedResponse, error) { return nil, s.err }
func (s stubStatusService) MarkViewed(string, uint, context.Context) (*models.StatusViewedEvent, error) {
	return nil, s.err
}
func (s stubStatusService) DeleteStatus(string, uint, context.Context) error                { return s.err }
func (s stubStatusService) GetAudienceTelephons(string, context.Context) ([]string, error) { return nil, s.err }

// ─────────────────────────────────────────────────────────────────────────────
// C3: ningún error interno (SQL, stack, direcciones) puede aparecer en el body
// de una respuesta HTTP, sin importar qué error devuelva el servicio.
// ─────────────────────────────────────────────────────────────────────────────

func TestErrorEnvelopeNeverLeaksInternals(t *testing.T) {
	raw := errors.New(`pq: duplicate key value violates unique constraint "users_username_key"`)
	sqlstate := errors.New(`SQLSTATE 23505: ERROR: duplicate key value violates unique constraint "uq_user_contact"`)
	conn := errors.New("dial tcp 127.0.0.1:5432: connect: connection refused")

	newCtx := func() (*gin.Context, *httptest.ResponseRecorder) {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest("POST", "/", nil)
		return c, w
	}

	t.Run("chat create message", func(t *testing.T) {
		c, w := newCtx()
		c.Set("telephon", "1111")
		c.Set("message", models.MessageGet{Receptor: "2222", Message: "hola"})
		svc := new(MockChatService)
		svc.On("ServiceCreatMessage", mock.Anything, mock.Anything).Return(schemas.Message{}, raw)
		(&HandlerChat{service: svc}).HandlerPostChat()(c)
		assert500Sanitized(t, w)
		svc.AssertExpectations(t)
	})

	t.Run("contact get user", func(t *testing.T) {
		c, w := newCtx()
		c.Set("telephon", "1111")
		svc := new(MockContactService)
		svc.On("ServicesGetUserByTelephon", "1111", mock.Anything).Return(nil, conn)
		(&HandlerContact{service: svc}).HandlerGetUser()(c)
		assertSanitized(t, w, http.StatusNotFound)
		svc.AssertExpectations(t)
	})

	t.Run("contact add", func(t *testing.T) {
		c, w := newCtx()
		c.Set("telephon", "1111")
		c.Set("contactAdd", models.ContactAdd{Number: "+50222222222", ContactName: "X"})
		svc := new(MockContactService)
		svc.On("AddContactByTelephon", "1111", mock.Anything, mock.Anything).Return(nil, sqlstate)
		(&HandlerContact{service: svc}).HandlerAddContact()(c)
		assertSanitized(t, w, http.StatusBadRequest)
		svc.AssertExpectations(t)
	})

	t.Run("contact list", func(t *testing.T) {
		c, w := newCtx()
		c.Set("telephon", "1111")
		svc := new(MockContactService)
		svc.On("ServiceGetContactsByTelephon", "1111", mock.Anything).Return(nil, conn)
		(&HandlerContact{service: svc}).HandlerContacts()(c)
		assertSanitized(t, w, http.StatusBadRequest)
		svc.AssertExpectations(t)
	})

	t.Run("media upload", func(t *testing.T) {
		var buf bytes.Buffer
		mw := multipart.NewWriter(&buf)
		fw, err := mw.CreateFormFile("file", "a.png")
		require.NoError(t, err)
		_, _ = fw.Write([]byte("x"))
		require.NoError(t, mw.Close())

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest("POST", "/upload", &buf)
		c.Request.Header.Set("Content-Type", mw.FormDataContentType())

		svc := new(MockMediaService)
		svc.On("UploadMedia", mock.Anything, mock.Anything, mock.Anything).Return(services.MediaUploadResult{}, raw)
		(&HandlerMedia{service: svc}).HandlerUploadMedia()(c)
		assertSanitized(t, w, http.StatusBadRequest)
		svc.AssertExpectations(t)
	})

	t.Run("bug report", func(t *testing.T) {
		c, w := newCtx()
		c.Set("bugReport", models.BugReport{Title: "t", Description: "d"})
		svc := new(MockBugReportService)
		svc.On("CreateGitHubIssue", mock.Anything).Return(raw)
		(&HandlerBugReport{service: svc}).HandleReportBug()(c)
		assert.Equal(t, http.StatusInternalServerError, w.Code)
		body := w.Body.String()
		assert.NotContains(t, body, "pq:")
		assert.NotContains(t, body, "duplicate key")
		assert.Contains(t, body, "Error al crear el issue en GitHub")
		svc.AssertExpectations(t)
	})

	t.Run("group create", func(t *testing.T) {
		c, w := newCtx()
		c.Set("telephon", "1111")
		c.Set("groupCreate", models.GroupCreate{Name: "g", Members: []string{"2222"}})
		(&HandlerGroup{service: stubGroupService{err: raw}}).HandleCreateGroup()(c)
		assertSanitized(t, w, http.StatusBadRequest)
	})

	t.Run("status create", func(t *testing.T) {
		c, w := newCtx()
		c.Set("telephon", "1111")
		c.Set("statusCreate", models.StatusCreate{Text: "hola"})
		(&HandlerStatus{service: stubStatusService{err: conn}}).HandleCreateStatus()(c)
		assertSanitized(t, w, http.StatusBadRequest)
	})

	t.Run("login with internal error", func(t *testing.T) {
		setupJWTSecret(t)
		c, w := newCtx()
		c.Set("username", "testuser")
		c.Set("password", "pw")
		svc := new(MockUserService)
		svc.On("LogIn", mock.Anything, mock.Anything).Return("", conn)
		(&HandlerUser{service: svc}).HandlerLogIn()(c)
		assertSanitized(t, w, http.StatusUnauthorized)
		svc.AssertExpectations(t)
	})
}

func assert500Sanitized(t *testing.T, w *httptest.ResponseRecorder) {
	assertSanitized(t, w, http.StatusInternalServerError)
}

func assertSanitized(t *testing.T, w *httptest.ResponseRecorder, wantStatus int) {
	t.Helper()
	assert.Equal(t, wantStatus, w.Code)
	body := w.Body.String()
	// Envelope uniforme presente
	assert.Contains(t, body, `"success":false`)
	assert.Contains(t, body, `"error"`)
	// Nada de internals
	assert.NotContains(t, body, "pq:")
	assert.NotContains(t, body, "duplicate key")
	assert.NotContains(t, body, "SQLSTATE")
	assert.NotContains(t, body, "dial tcp")
	assert.NotContains(t, body, ".go:")
	assert.NotContains(t, body, "goroutine")
	// Mensaje genérico seguro
	assert.Contains(t, body, "internal server error")
}

// C3: los errores de validación con mensaje seguro (AppError) conservan su
// mensaje exacto dentro del envelope.
func TestSafeValidationMessagePreservedInEnvelope(t *testing.T) {
	c, w := func() (*gin.Context, *httptest.ResponseRecorder) {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest("PUT", "/contact", nil)
		return c, w
	}()

	c.Set("telephon", "1111")
	c.Set("contactPut", models.GetContactPut{Number: "+50233333333", ContactName: "X"})

	svc := new(MockContactService)
	svc.On("ServicePutContactByTelephon", mock.Anything, mock.Anything).Return(nil, errors.New("contacto no encontrado"))
	(&HandlerContact{service: svc}).HandlerPutContact()(c)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Contains(t, w.Body.String(), `"success":false`)
	assert.Contains(t, w.Body.String(), "contacto no encontrado")
	assert.NotContains(t, w.Body.String(), ".go:")
	svc.AssertExpectations(t)
}

// R1 API: el envelope de éxito lleva success=true y data.
func TestSuccessEnvelopeShape(t *testing.T) {
	setupJWTSecret(t)

	svc := new(MockUserService)
	handler := &HandlerUser{service: svc}

	token, err := utils.GenerateToken("testuser", "12345678")
	require.NoError(t, err)
	svc.On("LogIn", mock.Anything, mock.Anything).Return(token, nil)
	svc.On("SaveRefreshToken", "testuser", mock.Anything, mock.Anything).Return(nil)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/login", nil)
	c.Set("username", "testuser")
	c.Set("password", "password123")

	handler.HandlerLogIn()(c)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), `"success":true`)
	assert.Contains(t, w.Body.String(), `"data":`)
	assert.Contains(t, w.Body.String(), `"request_id":`)
	svc.AssertExpectations(t)
}
