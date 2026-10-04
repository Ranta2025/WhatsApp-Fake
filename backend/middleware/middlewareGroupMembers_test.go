package middleware

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"gorm/backend/models"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

// ─────────────────────────────────────────────────────────────────────────────
// MiddlewareGroupTelephon
// ─────────────────────────────────────────────────────────────────────────────

func TestMiddlewareGroupTelephon(t *testing.T) {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Params = gin.Params{{Key: "telephon", Value: "+34600"}}
	MiddlewareGroupTelephon()(c)

	assert.False(t, c.IsAborted())
	tel, exists := c.Get("groupTelephon")
	assert.True(t, exists)
	assert.Equal(t, "+34600", tel)

	w2 := httptest.NewRecorder()
	c2, _ := gin.CreateTestContext(w2)
	c2.Params = gin.Params{{Key: "telephon", Value: ""}}
	MiddlewareGroupTelephon()(c2)
	assert.Equal(t, http.StatusBadRequest, w2.Code)
	assert.True(t, c2.IsAborted())
}

// ─────────────────────────────────────────────────────────────────────────────
// MiddlewareGroupMemberRole
// ─────────────────────────────────────────────────────────────────────────────

func runRoleMiddleware(t *testing.T, body interface{}) (*httptest.ResponseRecorder, *gin.Context) {
	t.Helper()
	raw, _ := json.Marshal(body)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("PUT", "/", bytes.NewReader(raw))
	c.Request.Header.Set("Content-Type", "application/json")
	MiddlewareGroupMemberRole()(c)
	return w, c
}

func TestMiddlewareGroupMemberRole(t *testing.T) {
	w, c := runRoleMiddleware(t, map[string]string{"role": models.GroupRoleAdmin})
	assert.False(t, c.IsAborted())
	got, exists := c.Get("groupMemberRole")
	assert.True(t, exists)
	assert.Equal(t, models.GroupRoleAdmin, got.(models.GroupMemberRoleUpdate).Role)

	w, c = runRoleMiddleware(t, map[string]string{"role": "superadmin"})
	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.True(t, c.IsAborted())

	w, c = runRoleMiddleware(t, map[string]string{})
	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.True(t, c.IsAborted())
}

// ─────────────────────────────────────────────────────────────────────────────
// MiddlewareGroupSettings / MiddlewareGroupInfo
// ─────────────────────────────────────────────────────────────────────────────

func runJSONMiddleware(t *testing.T, mw gin.HandlerFunc, body interface{}) (*httptest.ResponseRecorder, *gin.Context) {
	t.Helper()
	raw, _ := json.Marshal(body)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("PATCH", "/", bytes.NewReader(raw))
	c.Request.Header.Set("Content-Type", "application/json")
	mw(c)
	return w, c
}

func TestMiddlewareGroupSettings(t *testing.T) {
	w, c := runJSONMiddleware(t, MiddlewareGroupSettings(), map[string]interface{}{"onlyAdminsCanSend": true})
	assert.False(t, c.IsAborted())
	assert.Equal(t, http.StatusOK, w.Code)

	w, c = runJSONMiddleware(t, MiddlewareGroupSettings(), map[string]interface{}{})
	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.True(t, c.IsAborted())
}

func TestMiddlewareGroupInfo(t *testing.T) {
	w, c := runJSONMiddleware(t, MiddlewareGroupInfo(), map[string]interface{}{"description": "d"})
	assert.False(t, c.IsAborted())
	assert.Equal(t, http.StatusOK, w.Code)

	w, c = runJSONMiddleware(t, MiddlewareGroupInfo(), map[string]interface{}{})
	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.True(t, c.IsAborted())
}
