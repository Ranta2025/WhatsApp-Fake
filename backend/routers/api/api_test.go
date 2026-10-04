package api

import (
	"net/http"
	"net/http/httptest"
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

// TestApiPushRegistersRoutes comprueba los cuatro endpoints de Web Push y que
// quedan detrás del middleware de token del grupo protegido.
func TestApiPushRegistersRoutes(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	rout := InitRouterApiMessage(engine.Group("/api/v1"), nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil)
	rout.SetHandlerPush(handlers.InitHandlerPush(nil))

	assert.NotPanics(t, func() { rout.ApiPush() })

	got := map[string]bool{}
	for _, r := range engine.Routes() {
		got[r.Method+" "+r.Path] = true
	}
	for _, route := range []string{
		"GET /api/v1/push/config",
		"POST /api/v1/push/subscribe",
		"DELETE /api/v1/push/subscribe",
		"PUT /api/v1/push/preview",
	} {
		assert.True(t, got[route], "ruta registrada: %s", route)
	}

	// Sin cookie de sesión el middleware de token corta antes del handler.
	for _, r := range []struct{ method, path string }{
		{"GET", "/api/v1/push/config"},
		{"POST", "/api/v1/push/subscribe"},
	} {
		w := httptest.NewRecorder()
		engine.ServeHTTP(w, httptest.NewRequest(r.method, r.path, nil))
		assert.Equal(t, http.StatusUnauthorized, w.Code, r.path)
	}
}

func TestApiPushWithoutHandlerRegistersNothing(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	rout := &RouterApiMessage{app: engine.Group("/api/v1")}
	assert.NotPanics(t, func() { rout.ApiPush() })
	assert.Empty(t, engine.Routes())
}
