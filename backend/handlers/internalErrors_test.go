package handlers

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"gorm/backend/logging"
	"gorm/backend/models"
	"gorm/backend/schemas"
	"gorm/backend/services"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

// Texto que simula un error crudo de repo/gorm/pg y que jamás debe llegar al cliente.
const leakyRepoText = "buscar id de usuario: ERROR: relation \"secret_table\" does not exist (SQLSTATE 42P01)"

var errLeaky = fmt.Errorf("wrap: %w", errors.New(leakyRepoText))

type failingGroupService struct {
	services.GroupServicer
	err error
}

func (s *failingGroupService) GetUserGroups(string, context.Context) ([]schemas.GroupResponse, error) {
	return nil, s.err
}

func (s *failingGroupService) CreateGroup(string, models.GroupCreate, context.Context) (*schemas.GroupDetail, error) {
	return nil, s.err
}

func assertGenericInternal(t *testing.T, w *httptest.ResponseRecorder) {
	t.Helper()
	require.Equal(t, http.StatusInternalServerError, w.Code)
	assert.JSONEq(t, `{"error":"`+internalErrorMessage+`"}`, w.Body.String())
	assert.NotContains(t, w.Body.String(), "secret_table")
	assert.NotContains(t, w.Body.String(), "SQLSTATE")
}

func ctxWithRequest(method, target string) (*gin.Context, *httptest.ResponseRecorder) {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(method, target, nil)
	c.Set("telephon", "+1")
	return c, w
}

func TestInternalErrors_500PathsReturnGenericMessage(t *testing.T) {
	t.Run("search all", func(t *testing.T) {
		w := runGlobalSearch(&stubSearchService{err: errLeaky}, "/search?q=hola", true)
		assertGenericInternal(t, w)
	})
	t.Run("search window", func(t *testing.T) {
		c, w := ctxWithRequest("GET", "/x")
		respondWindowError(c, errLeaky)
		assertGenericInternal(t, w)
	})
	t.Run("get all chats", func(t *testing.T) {
		svc := new(MockChatService)
		svc.On("ServiceGetAllChats", "+1", mock.Anything).Return([]schemas.ChatGroup(nil), errLeaky)
		c, w := ctxWithRequest("GET", "/chat")
		(&HandlerChat{service: svc}).HandlerGetAllChats()(c)
		assertGenericInternal(t, w)
	})
	t.Run("post chat unknown error", func(t *testing.T) {
		msgGet := models.MessageGet{Receptor: "2", Message: "hi"}
		svc := new(MockChatService)
		svc.On("ServiceCreatMessage", models.MessageCreat{MessageGet: msgGet, Telephon: "+1"}, mock.Anything).Return(schemas.Message{}, errLeaky)
		c, w := ctxWithRequest("POST", "/chat")
		c.Set("message", msgGet)
		(&HandlerChat{service: svc}).HandlerPostChat()(c)
		assertGenericInternal(t, w)
	})
	t.Run("status feed", func(t *testing.T) {
		svc := new(MockStatusService)
		svc.On("GetFeed", "+1", mock.Anything).Return(schemas.StatusFeed{}, errLeaky)
		c, w := ctxWithRequest("GET", "/status")
		(&HandlerStatus{service: svc}).HandlerGetStatusFeed()(c)
		assertGenericInternal(t, w)
	})
	t.Run("get user groups", func(t *testing.T) {
		c, w := ctxWithRequest("GET", "/group")
		(&HandlerGroup{service: &failingGroupService{err: errLeaky}}).HandleGetUserGroups()(c)
		assertGenericInternal(t, w)
	})
}

func TestInternalErrors_DbErrorInA4xxDefaultBranchBecomes500(t *testing.T) {
	pgErr := fmt.Errorf("crear grupo: %w", &pgconn.PgError{Code: "42P01", Message: "relation \"secret_table\" does not exist"})
	c, w := ctxWithRequest("POST", "/group")
	c.Set("groupCreate", models.GroupCreate{})
	(&HandlerGroup{service: &failingGroupService{err: pgErr}}).HandleCreateGroup()(c)
	assertGenericInternal(t, w)
}

func TestInternalErrors_HandWrittenServiceMessageKeepsItsStatusAndText(t *testing.T) {
	c, w := ctxWithRequest("POST", "/group")
	c.Set("groupCreate", models.GroupCreate{})
	(&HandlerGroup{service: &failingGroupService{err: errors.New("el nombre del grupo no puede estar vacío")}}).HandleCreateGroup()(c)
	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.JSONEq(t, `{"error":"el nombre del grupo no puede estar vacío"}`, w.Body.String())
}

func TestInternalErrors_RawErrorIsLoggedWithRequestID(t *testing.T) {
	var buf bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&buf, nil)))
	t.Cleanup(func() { slog.SetDefault(prev) })

	c, w := ctxWithRequest("GET", "/group")
	c.Request = c.Request.WithContext(logging.WithRequestID(c.Request.Context(), "req-123"))
	(&HandlerGroup{service: &failingGroupService{err: errLeaky}}).HandleGetUserGroups()(c)

	assertGenericInternal(t, w)
	assert.Contains(t, buf.String(), "secret_table")
	assert.Contains(t, buf.String(), `"request_id":"req-123"`)
}
