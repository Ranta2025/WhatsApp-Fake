package middleware

import (
	"net/http/httptest"
	"strings"
	"testing"

	"gorm/backend/logging"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

// runRequestID ejecuta el middleware con una cabecera entrante opcional y
// devuelve el recorder (para leer la respuesta) y el contexto.
func runRequestID(inbound string) (*httptest.ResponseRecorder, *gin.Context) {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	req := httptest.NewRequest("GET", "/x", nil)
	if inbound != "" {
		req.Header.Set(requestIDHeader, inbound)
	}
	c.Request = req
	RequestID()(c)
	return w, c
}

func TestRequestIDGeneratedWhenAbsent(t *testing.T) {
	w, c := runRequestID("")

	got := w.Header().Get(requestIDHeader)
	assert.NotEmpty(t, got, "debe generar un id cuando no viene cabecera")
	assert.Regexp(t, requestIDPattern, got)

	fromCtx, exists := c.Get("requestID")
	assert.True(t, exists)
	assert.Equal(t, got, fromCtx)
}

func TestRequestIDAcceptsValidInbound(t *testing.T) {
	const inbound = "abc-123_XYZ.9"
	w, c := runRequestID(inbound)

	assert.Equal(t, inbound, w.Header().Get(requestIDHeader))
	fromCtx, _ := c.Get("requestID")
	assert.Equal(t, inbound, fromCtx)
}

func TestRequestIDReplacesInvalidInbound(t *testing.T) {
	cases := map[string]string{
		"con espacios":      "abc 123",
		"con barra":         "abc/123",
		"con arroba":        "abc@123",
		"con salto":         "abc\r\nInjected: 1",
		"mas de 64":         strings.Repeat("a", 65),
		"unicode":           "id-😀",
		"puntuacion":        "abc;DROP",
		"signos de control": string([]byte{1, 2, 3}),
	}

	for name, inbound := range cases {
		t.Run(name, func(t *testing.T) {
			w, c := runRequestID(inbound)

			got := w.Header().Get(requestIDHeader)
			assert.NotEqual(t, inbound, got, "un id inválido no debe reenviarse")
			assert.Regexp(t, requestIDPattern, got)
			fromCtx, _ := c.Get("requestID")
			assert.Equal(t, got, fromCtx)
		})
	}
}

// Los handlers pasan *gin.Context como context.Context (ContextWithFallback):
// el id guardado en el request context debe ser visible desde ahí.
func TestRequestIDContextIsVisibleThroughGinContextFallback(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.ContextWithFallback = true

	var seenID string
	engine.Use(RequestID())
	engine.GET("/x", func(c *gin.Context) {
		seenID = logging.RequestID(c)
		c.Status(200)
	})

	w := httptest.NewRecorder()
	engine.ServeHTTP(w, httptest.NewRequest("GET", "/x", nil))

	assert.Equal(t, w.Header().Get(requestIDHeader), seenID)
	assert.NotEmpty(t, seenID)
}

func TestRequestIDPropagatesToRequestContext(t *testing.T) {
	_, c := runRequestID("edge-id-1")

	assert.Equal(t, "edge-id-1", logging.RequestID(c.Request.Context()))
}
