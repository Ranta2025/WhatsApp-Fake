package handlers

import (
	"gorm/backend/models"
	"gorm/backend/schemas"
	"gorm/backend/services"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
)

func TestInitHandlerStatus(t *testing.T) {
	handler := InitHandlerStatus(nil, nil)
	assert.NotNil(t, handler)
}

func TestHandlerCreateStatusSuccess(t *testing.T) {
	mockService := new(MockStatusService)
	handler := &HandlerStatus{service: mockService}

	telephon := "12345678"
	body := models.StatusCreate{Type: "text", Text: "Hola"}
	item := schemas.StatusItem{ID: 1, Type: "text", Text: "Hola"}
	owner := schemas.StatusOwnerBrief{Telephon: telephon, Username: "owner"}

	mockService.On("CreateStatus", telephon, body, mock.Anything).Return(item, owner, []string{}, nil)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/status", nil)
	c.Set("telephon", telephon)
	c.Set("statusCreate", body)

	handler.HandlerCreateStatus()(c)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), "Hola")
	mockService.AssertExpectations(t)
}

func TestHandlerCreateStatusMissingData(t *testing.T) {
	handler := &HandlerStatus{service: nil}

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/status", nil)

	handler.HandlerCreateStatus()(c)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestHandlerCreateStatusValidationErrorIs400(t *testing.T) {
	mockService := new(MockStatusService)
	handler := &HandlerStatus{service: mockService}

	telephon := "12345678"
	body := models.StatusCreate{Type: "sticker"}

	mockService.On("CreateStatus", telephon, body, mock.Anything).
		Return(schemas.StatusItem{}, schemas.StatusOwnerBrief{}, []string(nil), services.ErrStatusInvalid)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/status", nil)
	c.Set("telephon", telephon)
	c.Set("statusCreate", body)

	handler.HandlerCreateStatus()(c)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestHandlerCreateStatusInfraErrorIs500NotMasked(t *testing.T) {
	mockService := new(MockStatusService)
	handler := &HandlerStatus{service: mockService}

	telephon := "12345678"
	body := models.StatusCreate{Type: "text", Text: "Hola"}

	mockService.On("CreateStatus", telephon, body, mock.Anything).
		Return(schemas.StatusItem{}, schemas.StatusOwnerBrief{}, []string(nil), assert.AnError)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/status", nil)
	c.Set("telephon", telephon)
	c.Set("statusCreate", body)

	handler.HandlerCreateStatus()(c)

	assert.Equal(t, http.StatusInternalServerError, w.Code)
	assert.NotContains(t, w.Body.String(), assert.AnError.Error(), "no debe filtrar el texto crudo del error interno")
}

func TestHandlerGetStatusFeedSuccess(t *testing.T) {
	mockService := new(MockStatusService)
	handler := &HandlerStatus{service: mockService}

	telephon := "12345678"
	feed := schemas.StatusFeed{Mine: []schemas.StatusItem{{ID: 1}}}

	mockService.On("GetFeed", telephon, mock.Anything).Return(feed, nil)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/status", nil)
	c.Set("telephon", telephon)

	handler.HandlerGetStatusFeed()(c)

	assert.Equal(t, http.StatusOK, w.Code)
	mockService.AssertExpectations(t)
}

func TestHandlerMarkStatusViewedSuccess(t *testing.T) {
	mockService := new(MockStatusService)
	handler := &HandlerStatus{service: mockService}

	telephon := "22222222"
	var statusID uint = 42
	viewer := schemas.StatusViewer{Telephon: telephon, Username: "viewer", ViewedAt: time.Now()}

	mockService.On("MarkStatusViewed", telephon, statusID, mock.Anything).
		Return(true, "11111111", viewer, int64(1), nil)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/status/42/view", nil)
	c.Set("telephon", telephon)
	c.Set("statusID", statusID)

	handler.HandlerMarkStatusViewed()(c)

	assert.Equal(t, http.StatusOK, w.Code)
	mockService.AssertExpectations(t)
}

func TestHandlerMarkStatusViewedForbidden(t *testing.T) {
	mockService := new(MockStatusService)
	handler := &HandlerStatus{service: mockService}

	telephon := "22222222"
	var statusID uint = 42

	mockService.On("MarkStatusViewed", telephon, statusID, mock.Anything).
		Return(false, "", schemas.StatusViewer{}, int64(0), services.ErrStatusForbidden)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/status/42/view", nil)
	c.Set("telephon", telephon)
	c.Set("statusID", statusID)

	handler.HandlerMarkStatusViewed()(c)

	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestHandlerMarkStatusViewedNotFound(t *testing.T) {
	mockService := new(MockStatusService)
	handler := &HandlerStatus{service: mockService}

	telephon := "22222222"
	var statusID uint = 42

	mockService.On("MarkStatusViewed", telephon, statusID, mock.Anything).
		Return(false, "", schemas.StatusViewer{}, int64(0), services.ErrStatusNotFound)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/status/42/view", nil)
	c.Set("telephon", telephon)
	c.Set("statusID", statusID)

	handler.HandlerMarkStatusViewed()(c)

	assert.Equal(t, http.StatusNotFound, w.Code)
}

func TestHandlerMarkStatusViewedInfraErrorIs500NotMasked(t *testing.T) {
	mockService := new(MockStatusService)
	handler := &HandlerStatus{service: mockService}

	telephon := "22222222"
	var statusID uint = 42

	mockService.On("MarkStatusViewed", telephon, statusID, mock.Anything).
		Return(false, "", schemas.StatusViewer{}, int64(0), assert.AnError)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/status/42/view", nil)
	c.Set("telephon", telephon)
	c.Set("statusID", statusID)

	handler.HandlerMarkStatusViewed()(c)

	assert.Equal(t, http.StatusInternalServerError, w.Code, "un error de infraestructura no debe disfrazarse de 403")
	assert.NotContains(t, w.Body.String(), assert.AnError.Error())
}

func TestHandlerGetStatusViewersOwnerSuccess(t *testing.T) {
	mockService := new(MockStatusService)
	handler := &HandlerStatus{service: mockService}

	telephon := "11111111"
	var statusID uint = 42
	viewers := []schemas.StatusViewer{{Telephon: "22222222", Username: "viewer"}}

	mockService.On("GetStatusViewers", telephon, statusID, mock.Anything).Return(viewers, nil)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/status/42/views", nil)
	c.Set("telephon", telephon)
	c.Set("statusID", statusID)

	handler.HandlerGetStatusViewers()(c)

	assert.Equal(t, http.StatusOK, w.Code)
	mockService.AssertExpectations(t)
}

func TestHandlerGetStatusViewersForbidden(t *testing.T) {
	mockService := new(MockStatusService)
	handler := &HandlerStatus{service: mockService}

	telephon := "22222222"
	var statusID uint = 42

	mockService.On("GetStatusViewers", telephon, statusID, mock.Anything).
		Return([]schemas.StatusViewer(nil), services.ErrStatusForbidden)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/status/42/views", nil)
	c.Set("telephon", telephon)
	c.Set("statusID", statusID)

	handler.HandlerGetStatusViewers()(c)

	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestHandlerGetStatusViewersInfraErrorIs500NotMasked(t *testing.T) {
	mockService := new(MockStatusService)
	handler := &HandlerStatus{service: mockService}

	telephon := "22222222"
	var statusID uint = 42

	mockService.On("GetStatusViewers", telephon, statusID, mock.Anything).
		Return([]schemas.StatusViewer(nil), assert.AnError)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/status/42/views", nil)
	c.Set("telephon", telephon)
	c.Set("statusID", statusID)

	handler.HandlerGetStatusViewers()(c)

	assert.Equal(t, http.StatusInternalServerError, w.Code)
	assert.NotContains(t, w.Body.String(), assert.AnError.Error())
}

func TestHandlerDeleteStatusOwnerSuccess(t *testing.T) {
	mockService := new(MockStatusService)
	handler := &HandlerStatus{service: mockService}

	telephon := "11111111"
	var statusID uint = 42

	mockService.On("DeleteStatus", telephon, statusID, mock.Anything).Return([]string{}, nil)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("DELETE", "/status/42", nil)
	c.Set("telephon", telephon)
	c.Set("statusID", statusID)

	handler.HandlerDeleteStatus()(c)

	assert.Equal(t, http.StatusOK, w.Code)
	mockService.AssertExpectations(t)
}

func TestHandlerDeleteStatusNotFound(t *testing.T) {
	mockService := new(MockStatusService)
	handler := &HandlerStatus{service: mockService}

	telephon := "22222222"
	var statusID uint = 42

	mockService.On("DeleteStatus", telephon, statusID, mock.Anything).
		Return([]string(nil), services.ErrStatusNotFound)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("DELETE", "/status/42", nil)
	c.Set("telephon", telephon)
	c.Set("statusID", statusID)

	handler.HandlerDeleteStatus()(c)

	assert.Equal(t, http.StatusNotFound, w.Code)
}

func TestHandlerDeleteStatusInfraErrorIs500NotMasked(t *testing.T) {
	mockService := new(MockStatusService)
	handler := &HandlerStatus{service: mockService}

	telephon := "22222222"
	var statusID uint = 42

	mockService.On("DeleteStatus", telephon, statusID, mock.Anything).
		Return([]string(nil), assert.AnError)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("DELETE", "/status/42", nil)
	c.Set("telephon", telephon)
	c.Set("statusID", statusID)

	handler.HandlerDeleteStatus()(c)

	assert.Equal(t, http.StatusInternalServerError, w.Code, "no debe disfrazar un error de infraestructura de 403")
	assert.NotContains(t, w.Body.String(), assert.AnError.Error())
}
