package services

import (
	"context"
	"crypto/ecdh"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"sync"
	"testing"

	"gorm/backend/config"
	"gorm/backend/models"

	webpush "github.com/SherClockHolmes/webpush-go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPushStatusError_Mapping(t *testing.T) {
	for _, code := range []int{200, 201, 202, 204} {
		assert.NoError(t, pushStatusError(code), code)
	}
	// 401/403: la suscripción ya no es válida para nuestras claves VAPID
	// (p. ej. se rotaron); reintentar no sirve, se borra como un 404/410.
	for _, code := range []int{401, 403, 404, 410} {
		assert.ErrorIs(t, pushStatusError(code), ErrPushGone, code)
	}
	for _, code := range []int{302, 400, 413, 429, 500, 503} {
		err := pushStatusError(code)
		require.Error(t, err, code)
		assert.NotErrorIs(t, err, ErrPushGone, code)
		assert.Contains(t, err.Error(), http.StatusText(code))
	}
}

// fakePushTransport responde con un status fijo y registra las peticiones.
type fakePushTransport struct {
	mu     sync.Mutex
	status int
	header http.Header
	reqs   []*http.Request
	bodies []*trackedBody
}

type trackedBody struct {
	io.Reader
	closed bool
}

func (b *trackedBody) Close() error { b.closed = true; return nil }

func (f *fakePushTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.reqs = append(f.reqs, r)
	body := &trackedBody{Reader: strings.NewReader("respuesta")}
	f.bodies = append(f.bodies, body)
	h := f.header
	if h == nil {
		h = http.Header{}
	}
	return &http.Response{StatusCode: f.status, Status: http.StatusText(f.status), Header: h, Body: body, Request: r}, nil
}

// testPushSubscription genera claves de suscripción válidas (P-256 + auth).
func testPushSubscription(t *testing.T, endpoint string) models.PushSubscription {
	t.Helper()
	key, err := ecdh.P256().GenerateKey(rand.Reader)
	require.NoError(t, err)
	auth := make([]byte, 16)
	_, err = rand.Read(auth)
	require.NoError(t, err)
	return models.PushSubscription{
		ID:       5,
		Endpoint: endpoint,
		P256dh:   base64.RawURLEncoding.EncodeToString(key.PublicKey().Bytes()),
		Auth:     base64.RawURLEncoding.EncodeToString(auth),
	}
}

func testPushConfig(t *testing.T, subject string) config.PushConfig {
	t.Helper()
	priv, pub, err := webpush.GenerateVAPIDKeys()
	require.NoError(t, err)
	return config.PushConfig{Enabled: true, PublicKey: pub, PrivateKey: priv, Subject: subject, Preview: true}
}

func allowAll(string) bool { return true }

// jwtSub extrae el claim "sub" del JWT VAPID de la cabecera Authorization.
func jwtSub(t *testing.T, authHeader string) string {
	t.Helper()
	require.True(t, strings.HasPrefix(authHeader, "vapid t="), authHeader)
	token := strings.SplitN(strings.TrimPrefix(authHeader, "vapid t="), ",", 2)[0]
	parts := strings.Split(token, ".")
	require.Len(t, parts, 3)
	raw, err := base64.RawURLEncoding.DecodeString(parts[1])
	require.NoError(t, err)
	var claims map[string]interface{}
	require.NoError(t, json.Unmarshal(raw, &claims))
	return claims["sub"].(string)
}

func TestWebPushSender_SendsWithExpectedOptions(t *testing.T) {
	rt := &fakePushTransport{status: http.StatusCreated}
	s := newWebPushSender(testPushConfig(t, "mailto:admin@example.com"), rt, allowAll)

	err := s.Send(context.Background(), testPushSubscription(t, "https://fcm.googleapis.com/fcm/send/abc"), []byte(`{"v":1}`))
	require.NoError(t, err)

	require.Len(t, rt.reqs, 1)
	req := rt.reqs[0]
	assert.Equal(t, http.MethodPost, req.Method)
	assert.Equal(t, "https://fcm.googleapis.com/fcm/send/abc", req.URL.String())
	assert.Equal(t, "86400", req.Header.Get("TTL"))
	assert.Equal(t, "normal", req.Header.Get("Urgency"))
	assert.Equal(t, "aes128gcm", req.Header.Get("Content-Encoding"))
	assert.Equal(t, "mailto:admin@example.com", jwtSub(t, req.Header.Get("Authorization")), "sin mailto: duplicado")
	assert.True(t, rt.bodies[0].closed, "el body de la respuesta se cierra")
}

func TestWebPushSender_HTTPSSubjectKeptAsIs(t *testing.T) {
	rt := &fakePushTransport{status: http.StatusCreated}
	s := newWebPushSender(testPushConfig(t, "https://chat.example.com"), rt, allowAll)

	require.NoError(t, s.Send(context.Background(), testPushSubscription(t, "https://fcm.googleapis.com/x"), []byte(`{}`)))
	assert.Equal(t, "https://chat.example.com", jwtSub(t, rt.reqs[0].Header.Get("Authorization")))
}

func TestWebPushSender_MapsStatus(t *testing.T) {
	cases := []struct {
		status int
		gone   bool
	}{{http.StatusGone, true}, {http.StatusNotFound, true}, {http.StatusTooManyRequests, false}, {http.StatusInternalServerError, false}}
	for _, tc := range cases {
		rt := &fakePushTransport{status: tc.status}
		s := newWebPushSender(testPushConfig(t, "mailto:a@b.c"), rt, allowAll)
		err := s.Send(context.Background(), testPushSubscription(t, "https://fcm.googleapis.com/x"), []byte(`{}`))
		require.Error(t, err, tc.status)
		assert.Equal(t, tc.gone, errors.Is(err, ErrPushGone), tc.status)
		assert.True(t, rt.bodies[0].closed)
	}
}

// errPushTransport falla siempre como un error de red.
type errPushTransport struct{}

func (errPushTransport) RoundTrip(*http.Request) (*http.Response, error) {
	return nil, errors.New("dial tcp: connection refused")
}

func TestWebPushSender_TransportErrorDoesNotLeakEndpoint(t *testing.T) {
	endpoint := "https://fcm.googleapis.com/fcm/send/secreto-capacidad"
	s := newWebPushSender(testPushConfig(t, "mailto:a@b.c"), errPushTransport{}, allowAll)

	err := s.Send(context.Background(), testPushSubscription(t, endpoint), []byte(`{}`))
	require.Error(t, err)
	assert.NotContains(t, err.Error(), endpoint)
	assert.NotContains(t, err.Error(), "secreto-capacidad")
	assert.Contains(t, err.Error(), "connection refused")
}

func TestWebPushSender_DoesNotFollowRedirects(t *testing.T) {
	rt := &fakePushTransport{status: http.StatusFound, header: http.Header{"Location": []string{"http://169.254.169.254/latest"}}}
	s := newWebPushSender(testPushConfig(t, "mailto:a@b.c"), rt, allowAll)

	err := s.Send(context.Background(), testPushSubscription(t, "https://fcm.googleapis.com/x"), []byte(`{}`))
	require.Error(t, err)
	assert.Len(t, rt.reqs, 1, "una redirección no se sigue (SSRF)")
}

func TestWebPushSender_RechecksAllowlist(t *testing.T) {
	rt := &fakePushTransport{status: http.StatusCreated}
	s := NewWebPushSender(testPushConfig(t, "mailto:a@b.c"))
	s.client.Transport = rt

	err := s.Send(context.Background(), testPushSubscription(t, "https://evil.example.com/x"), []byte(`{}`))
	assert.ErrorIs(t, err, ErrPushEndpointNotAllowed)
	assert.Empty(t, rt.reqs)
}

func TestNewWebPushSender_HasTimeout(t *testing.T) {
	s := NewWebPushSender(testPushConfig(t, "mailto:a@b.c"))
	assert.Equal(t, pushSendTimeout, s.client.Timeout)
	assert.NotNil(t, s.client.CheckRedirect)
}
