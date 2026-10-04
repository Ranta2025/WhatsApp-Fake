package middleware

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// El middleware solo decodifica: el valor de la duración lo valida el
// servicio (ErrMuteInvalidDuration -> 400), así hay un único lugar con la lista.
func TestMiddlewareMuteDuration(t *testing.T) {
	for body, want := range map[string]string{
		`{"duration":"8h"}`:     "8h",
		`{"duration":"always"}`: "always",
		`{"duration":"2d"}`:     "2d",
		`{}`:                    "",
	} {
		_, c := runPushMiddleware(MiddlewareMuteDuration(), "PUT", body)
		require.False(t, c.IsAborted(), body)
		v, ok := c.Get("muteDuration")
		require.True(t, ok, body)
		assert.Equal(t, want, v.(string), body)
	}
	for _, body := range []string{`{"duration":8}`, `x`, ``} {
		w, c := runPushMiddleware(MiddlewareMuteDuration(), "PUT", body)
		assert.True(t, c.IsAborted(), body)
		assert.Equal(t, http.StatusBadRequest, w.Code, body)
	}
}
