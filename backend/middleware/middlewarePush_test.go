package middleware

import (
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"gorm/backend/models"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var (
	pushP256 = func() string { p := make([]byte, 65); p[0] = 4; return base64.RawURLEncoding.EncodeToString(p) }()
	pushAuth = base64.RawURLEncoding.EncodeToString(make([]byte, 16))
)

func runPushMiddleware(h gin.HandlerFunc, method, body string) (*httptest.ResponseRecorder, *gin.Context) {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(method, "/push", strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	h(c)
	return w, c
}

func TestMiddlewarePushSubscribeAcceptsBrowserShape(t *testing.T) {
	body := `{"endpoint":"https://fcm.googleapis.com/fcm/send/abc","expirationTime":null,"keys":{"p256dh":"` + pushP256 + `","auth":"` + pushAuth + `"}}`
	w, c := runPushMiddleware(MiddlewarePushSubscribe(), "POST", body)
	require.False(t, c.IsAborted(), w.Body.String())
	v, ok := c.Get("pushSubscription")
	require.True(t, ok)
	sub := v.(models.PushSubscriptionInput)
	assert.Equal(t, "https://fcm.googleapis.com/fcm/send/abc", sub.Endpoint)
	assert.Equal(t, pushP256, sub.Keys.P256dh)
	assert.Equal(t, pushAuth, sub.Keys.Auth)
}

func TestMiddlewarePushSubscribeAcceptsNumericExpiration(t *testing.T) {
	body := `{"endpoint":"https://web.push.apple.com/x","expirationTime":1735689600000,"keys":{"p256dh":"` + pushP256 + `","auth":"` + pushAuth + `"}}`
	_, c := runPushMiddleware(MiddlewarePushSubscribe(), "POST", body)
	assert.False(t, c.IsAborted())
}

func TestMiddlewarePushSubscribeRejects(t *testing.T) {
	cases := map[string]string{
		"json roto":        `{`,
		"ssrf":             `{"endpoint":"https://127.0.0.1/x","keys":{"p256dh":"` + pushP256 + `","auth":"` + pushAuth + `"}}`,
		"sufijo crudo":     `{"endpoint":"https://fcm.googleapis.com.evil.com/x","keys":{"p256dh":"` + pushP256 + `","auth":"` + pushAuth + `"}}`,
		"sin keys":         `{"endpoint":"https://fcm.googleapis.com/x"}`,
		"auth corto":       `{"endpoint":"https://fcm.googleapis.com/x","keys":{"p256dh":"` + pushP256 + `","auth":"AAAA"}}`,
		"cuerpo enorme":    `{"endpoint":"https://fcm.googleapis.com/` + strings.Repeat("a", 20000) + `","keys":{}}`,
		"endpoint vacío":   `{"endpoint":"","keys":{"p256dh":"` + pushP256 + `","auth":"` + pushAuth + `"}}`,
		"endpoint de tipo": `{"endpoint":1,"keys":{"p256dh":"` + pushP256 + `","auth":"` + pushAuth + `"}}`,
	}
	for name, body := range cases {
		t.Run(name, func(t *testing.T) {
			w, c := runPushMiddleware(MiddlewarePushSubscribe(), "POST", body)
			assert.True(t, c.IsAborted())
			assert.Equal(t, http.StatusBadRequest, w.Code)
			_, ok := c.Get("pushSubscription")
			assert.False(t, ok)
		})
	}
}

func TestMiddlewarePushUnsubscribe(t *testing.T) {
	_, c := runPushMiddleware(MiddlewarePushUnsubscribe(), "DELETE", `{"endpoint":"https://fcm.googleapis.com/x"}`)
	require.False(t, c.IsAborted())
	assert.Equal(t, "https://fcm.googleapis.com/x", c.GetString("pushEndpoint"))

	for _, body := range []string{`{}`, `{"endpoint":""}`, `nope`, `{"endpoint":"https://fcm.googleapis.com/` + strings.Repeat("a", 1100) + `"}`} {
		w, c := runPushMiddleware(MiddlewarePushUnsubscribe(), "DELETE", body)
		assert.True(t, c.IsAborted(), body)
		assert.Equal(t, http.StatusBadRequest, w.Code, body)
	}
}

func TestMiddlewarePushPreview(t *testing.T) {
	for body, want := range map[string]bool{`{"preview":true}`: true, `{"preview":false}`: false} {
		_, c := runPushMiddleware(MiddlewarePushPreview(), "PUT", body)
		require.False(t, c.IsAborted(), body)
		v, ok := c.Get("pushPreview")
		require.True(t, ok)
		assert.Equal(t, want, v.(bool))
	}
	for _, body := range []string{`{}`, `{"preview":null}`, `{"preview":"yes"}`, `x`} {
		w, c := runPushMiddleware(MiddlewarePushPreview(), "PUT", body)
		assert.True(t, c.IsAborted(), body)
		assert.Equal(t, http.StatusBadRequest, w.Code, body)
	}
}
