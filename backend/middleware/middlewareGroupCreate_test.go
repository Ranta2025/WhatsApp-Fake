package middleware

import (
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"testing"

	"gorm/backend/models"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func runCreateMiddleware(t *testing.T, body interface{}) (*httptest.ResponseRecorder, *gin.Context) {
	t.Helper()
	raw, _ := json.Marshal(body)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/", bytes.NewReader(raw))
	c.Request.Header.Set("Content-Type", "application/json")
	MiddlewareGroupCreate()(c)
	return w, c
}

// TestMiddlewareGroupCreate_OptionalSettings fija el contrato JSON de la
// creación: los tres settings son opcionales (ausencia = false, default abierto)
// y llegan al body tipado cuando vienen.
func TestMiddlewareGroupCreate_OptionalSettings(t *testing.T) {
	_, c := runCreateMiddleware(t, map[string]interface{}{
		"name":                    "Configurado",
		"members":                 []string{"+34600000002"},
		"onlyAdminsCanSend":       true,
		"onlyAdminsCanEditInfo":   true,
		"onlyAdminsCanAddMembers": true,
	})
	assert.False(t, c.IsAborted())
	got, exists := c.Get("groupCreate")
	assert.True(t, exists)
	data := got.(models.GroupCreate)
	assert.True(t, data.OnlyAdminsCanSend)
	assert.True(t, data.OnlyAdminsCanEditInfo)
	assert.True(t, data.OnlyAdminsCanAddMembers)

	_, c2 := runCreateMiddleware(t, map[string]interface{}{
		"name":    "Abierto",
		"members": []string{"+34600000002"},
	})
	assert.False(t, c2.IsAborted())
	got2, exists := c2.Get("groupCreate")
	assert.True(t, exists)
	data2 := got2.(models.GroupCreate)
	assert.False(t, data2.OnlyAdminsCanSend)
	assert.False(t, data2.OnlyAdminsCanEditInfo)
	assert.False(t, data2.OnlyAdminsCanAddMembers)
}
