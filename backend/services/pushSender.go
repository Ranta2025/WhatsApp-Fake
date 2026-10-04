package services

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"gorm/backend/config"
	"gorm/backend/models"
	"gorm/backend/utils"

	webpush "github.com/SherClockHolmes/webpush-go"
)

const (
	// pushTTLSeconds: el servicio de push guarda el mensaje hasta 24 h si el
	// dispositivo está apagado.
	pushTTLSeconds = 86400
	// pushSendTimeout acota cada POST al servicio de push.
	pushSendTimeout = 10 * time.Second
	// maxPushResponseDrain limita cuánto cuerpo de respuesta se lee antes de
	// cerrar (para reutilizar la conexión sin leer respuestas enormes).
	maxPushResponseDrain = 4 << 10
)

var (
	// ErrPushGone: el servicio de push respondió 404/410, la suscripción ya no
	// existe y debe borrarse.
	ErrPushGone = errors.New("suscripción push expirada")
	// ErrPushEndpointNotAllowed: el endpoint guardado no pasa la allowlist
	// (defensa en profundidad contra SSRF; el alta ya lo validó).
	ErrPushEndpointNotAllowed = errors.New("endpoint push fuera de la allowlist")
)

// PushSender envía un payload (ya serializado) a una suscripción Web Push.
type PushSender interface {
	Send(ctx context.Context, sub models.PushSubscription, payload []byte) error
}

// WebPushSender implementa PushSender con webpush-go (cifrado aes128gcm + VAPID).
type WebPushSender struct {
	cfg    config.PushConfig
	client *http.Client
	allow  func(endpoint string) bool
}

// NewWebPushSender crea el emisor real: cliente HTTP con timeout de 10 s que
// no sigue redirecciones y allowlist de servicios de push.
func NewWebPushSender(cfg config.PushConfig) *WebPushSender {
	return newWebPushSender(cfg, nil, utils.IsAllowedPushEndpoint)
}

// newWebPushSender permite inyectar el transporte y la allowlist en los tests.
func newWebPushSender(cfg config.PushConfig, transport http.RoundTripper, allow func(string) bool) *WebPushSender {
	return &WebPushSender{
		cfg: cfg,
		client: &http.Client{
			Timeout:   pushSendTimeout,
			Transport: transport,
			// Una redirección podría llevar el POST fuera de la allowlist.
			CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
		},
		allow: allow,
	}
}

// vapidSubscriber adapta VAPID_SUBJECT a lo que espera webpush-go: la
// librería antepone "mailto:" a todo lo que no empiece por "https:", así que
// hay que quitárselo para no enviar "mailto:mailto:...".
func vapidSubscriber(subject string) string {
	return strings.TrimPrefix(subject, "mailto:")
}

func (s *WebPushSender) Send(ctx context.Context, sub models.PushSubscription, payload []byte) error {
	if !s.allow(sub.Endpoint) {
		return ErrPushEndpointNotAllowed
	}
	resp, err := webpush.SendNotificationWithContext(ctx, payload, &webpush.Subscription{
		Endpoint: sub.Endpoint,
		Keys:     webpush.Keys{Auth: sub.Auth, P256dh: sub.P256dh},
	}, &webpush.Options{
		HTTPClient:      s.client,
		Subscriber:      vapidSubscriber(s.cfg.Subject),
		VAPIDPublicKey:  s.cfg.PublicKey,
		VAPIDPrivateKey: s.cfg.PrivateKey,
		TTL:             pushTTLSeconds,
		Urgency:         webpush.UrgencyNormal,
	})
	if err != nil {
		return fmt.Errorf("enviar push: %w", err)
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, maxPushResponseDrain))
	return pushStatusError(resp.StatusCode)
}

// pushStatusError traduce la respuesta del servicio de push: 2xx = éxito,
// 404/410 = ErrPushGone (borrar la suscripción), resto = error con el status.
func pushStatusError(code int) error {
	switch {
	case code >= 200 && code < 300:
		return nil
	case code == http.StatusNotFound || code == http.StatusGone:
		return fmt.Errorf("%w (%d)", ErrPushGone, code)
	default:
		return fmt.Errorf("servicio de push respondió %d %s", code, http.StatusText(code))
	}
}
