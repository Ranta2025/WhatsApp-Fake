package handlers
/*
import (
	"encoding/json"
	"gorm/backend/models"
	"gorm/backend/schemas"
	"gorm/backend/services"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
)

func TestHandlerGetCallHistory(t *testing.T) {
	mockService := new(MockCallService)
	handler := &HandlerCall{service: mockService}

	telephon := "12345678"
	calls := []schemas.CallLogResponse{
		{ID: 1, CallerTelephon: telephon, ReceiverTelephon: "87654321", CallType: "voice", Status: "answered"},
	}

	mockService.On("GetCallHistory", telephon, mock.Anything).Return(calls, nil)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Set("telephon", telephon)
	c.Request = httptest.NewRequest("GET", "/call/history", nil)

	handler.GetCallHistory()(c)

	assert.Equal(t, http.StatusOK, w.Code)
	var response map[string][]schemas.CallLogResponse
	json.Unmarshal(w.Body.Bytes(), &response)
	assert.Len(t, response["calls"], 1)
	mockService.AssertExpectations(t)
}

func TestHandlerDeleteCallLog(t *testing.T) {
	mockService := new(MockCallService)
	handler := &HandlerCall{service: mockService}

	telephon := "12345678"
	var callID uint = 1

	mockService.On("DeleteCallForUser", callID, telephon, mock.Anything).Return(nil)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("DELETE", "/call/1", nil) // Añadir Request
	c.Set("telephon", telephon)
	c.Set("callID", callID)

	handler.DeleteCallLog()(c)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), "Registro eliminado")
	mockService.AssertExpectations(t)
}

func TestHandlerHandleReportBug(t *testing.T) {
	mockService := new(MockBugReportService)
	handler := &HandlerBugReport{service: mockService}

	report := models.BugReport{
		Title:       "Test Bug",
		Description: "Something went wrong",
	}

	mockService.On("CreateGitHubIssue", report).Return(nil)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Set("bugReport", report)

	handler.HandleReportBug()(c)

	assert.Equal(t, http.StatusCreated, w.Code)
	assert.Contains(t, w.Body.String(), "Bug reportado exitosamente")
	mockService.AssertExpectations(t)
}

func TestHandlerUploadMedia(t *testing.T) {
	// Este test es complejo por el multipart, haremos uno simplificado para cobertura
	// En una auditoría real, se probarían los fallos de bindeo
	mockService := new(MockCallService)
	handler := &HandlerMedia{service: mockService}

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)

	// Simular error de bindeo
	c.Request = httptest.NewRequest("POST", "/upload", nil)

	handler.HandlerUploadMedia()(c)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}
*/