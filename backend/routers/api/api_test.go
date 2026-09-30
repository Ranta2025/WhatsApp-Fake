package api

import (
	"testing"

	"gorm/backend/handlers"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

// TestApiGroupRegistersMemberManagementRoutes garantiza que el árbol de rutas
// de gin no colisiona (gin entra en pánico ante rutas conflictivas) y que los
// endpoints de GA3 quedan registrados con su método y path exactos.
func TestApiGroupRegistersMemberManagementRoutes(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	// Handler vacío: sólo se registran closures, no se invocan.
	rout := &RouterApiMessage{
		app:          engine.Group("/api/v1"),
		handlerGroup: &handlers.HandlerGroup{},
	}

	assert.NotPanics(t, func() { rout.ApiGroup() })

	got := map[string]bool{}
	for _, r := range engine.Routes() {
		got[r.Method+" "+r.Path] = true
	}

	want := []string{
		"PUT /api/v1/group/:groupID/members/:telephon/role",
		"DELETE /api/v1/group/:groupID/members/:telephon",
		"PATCH /api/v1/group/:groupID/settings",
		"PATCH /api/v1/group/:groupID",
		"DELETE /api/v1/group/:groupID/member",
		"POST /api/v1/group/:groupID/members",
		"PATCH /api/v1/group/:groupID/avatar",
	}
	for _, route := range want {
		assert.True(t, got[route], "ruta registrada: %s", route)
	}
}
