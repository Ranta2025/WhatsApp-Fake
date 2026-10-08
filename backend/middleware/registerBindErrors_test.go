package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func runRegister(body string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/register", strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	MiddlewareLogOut()(c)
	return w
}

func TestMiddlewareRegister_BindErrorsAreFieldSpecific(t *testing.T) {
	cases := []struct {
		name string
		body string
		want string
	}{
		{"email invalido", `{"username":"usuario1","email":"no-es-email","telephon":"+5355123456","password":"Abcdef12!"}`, "El email no es válido"},
		{"telefono invalido", `{"username":"usuario1","email":"a@b.com","telephon":"5355123456","password":"Abcdef12!"}`, "El número de teléfono no es válido (formato internacional, ej: +5355123456)"},
		{"campo ausente", `{"username":"usuario1","telephon":"+5355123456","password":"Abcdef12!"}`, "Complete todos los campos"},
		{"json malformado", `{"username":`, "Complete todos los campos"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			w := runRegister(tc.body)
			require.Equal(t, http.StatusBadRequest, w.Code)
			assert.JSONEq(t, `{"error":"`+tc.want+`"}`, w.Body.String())
		})
	}
}
