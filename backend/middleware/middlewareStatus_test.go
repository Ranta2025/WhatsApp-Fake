package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

// ==================== R3-status-id-lenient-parse ====================

func runMiddlewareStatusID(id string) (*httptest.ResponseRecorder, *gin.Context) {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/status/"+id, nil)
	c.Params = gin.Params{{Key: "id", Value: id}}
	MiddlewareStatusID()(c)
	return w, c
}

func TestMiddlewareStatusIDAcceptsValidID(t *testing.T) {
	w, c := runMiddlewareStatusID("42")

	assert.False(t, c.IsAborted())
	assert.NotEqual(t, http.StatusBadRequest, w.Code)
	statusID, exists := c.Get("statusID")
	assert.True(t, exists)
	assert.Equal(t, uint(42), statusID)
}

func TestMiddlewareStatusIDRejectsTrailingGarbage(t *testing.T) {
	w, c := runMiddlewareStatusID("12abc")

	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.True(t, c.IsAborted())
	_, exists := c.Get("statusID")
	assert.False(t, exists)
}

func TestMiddlewareStatusIDRejectsLeadingGarbage(t *testing.T) {
	w, c := runMiddlewareStatusID("abc12")

	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.True(t, c.IsAborted())
}

func TestMiddlewareStatusIDRejectsZero(t *testing.T) {
	w, c := runMiddlewareStatusID("0")

	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.True(t, c.IsAborted())
}

func TestMiddlewareStatusIDRejectsNegative(t *testing.T) {
	w, c := runMiddlewareStatusID("-1")

	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.True(t, c.IsAborted())
}

func TestMiddlewareStatusIDRejectsOverflow(t *testing.T) {
	w, c := runMiddlewareStatusID("99999999999999999999999999")

	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.True(t, c.IsAborted())
}

func TestMiddlewareStatusIDRejectsEmpty(t *testing.T) {
	w, c := runMiddlewareStatusID("")

	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.True(t, c.IsAborted())
}
