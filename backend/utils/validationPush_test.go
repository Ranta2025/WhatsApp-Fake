package utils

import (
	"encoding/base64"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestIsAllowedPushEndpoint(t *testing.T) {
	cases := []struct {
		name string
		raw  string
		want bool
	}{
		{"fcm", "https://fcm.googleapis.com/fcm/send/abc:APA91b", true},
		{"fcm puerto 443 explícito", "https://fcm.googleapis.com:443/fcm/send/abc", true},
		{"android legacy", "https://android.googleapis.com/gcm/send/abc", true},
		{"mozilla", "https://updates.push.services.mozilla.com/wpush/v2/gAAAA", true},
		{"mozilla subdominio", "https://push.services.mozilla.com/wpush/v1/x", true},
		{"apple", "https://web.push.apple.com/QGxyz", true},
		{"apple subdominio", "https://api.push.apple.com/3/device/x", true},
		{"windows", "https://wns2-par02p.notify.windows.com/w/?token=abc", true},
		{"mayúsculas en host", "https://FCM.googleapis.com/fcm/send/x", true},

		{"sufijo crudo fcm.googleapis.com.evil.com", "https://fcm.googleapis.com.evil.com/x", false},
		{"sufijo sin punto evilpush.apple.com", "https://evilpush.apple.com/x", false},
		{"http", "http://fcm.googleapis.com/x", false},
		{"userinfo", "https://user@fcm.googleapis.com/x", false},
		{"userinfo con password", "https://user:pw@fcm.googleapis.com/x", false},
		{"puerto no 443", "https://fcm.googleapis.com:8443/x", false},
		{"ip loopback", "https://127.0.0.1/x", false},
		{"ipv6", "https://[::1]/x", false},
		{"googleapis genérico", "https://storage.googleapis.com/x", false},
		{"vacío", "", false},
		{"relativo", "/fcm/send/x", false},
		{"esquema raro", "javascript:alert(1)", false},
		{"host vacío", "https:///x", false},
		{"demasiado largo", "https://fcm.googleapis.com/" + strings.Repeat("a", 1024), false},
		{"punto final", "https://fcm.googleapis.com./x", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, IsAllowedPushEndpoint(tc.raw), tc.raw)
		})
	}
}

func TestValidPushKeys(t *testing.T) {
	p256 := make([]byte, 65)
	p256[0] = 0x04
	auth := make([]byte, 16)
	rawP := base64.RawURLEncoding.EncodeToString(p256)
	rawA := base64.RawURLEncoding.EncodeToString(auth)
	padP := base64.URLEncoding.EncodeToString(p256)
	padA := base64.URLEncoding.EncodeToString(auth)

	cases := []struct {
		name         string
		p256dh, auth string
		want         bool
	}{
		{"raw base64url", rawP, rawA, true},
		{"con padding", padP, padA, true},
		{"p256dh vacío", "", rawA, false},
		{"auth vacío", rawP, "", false},
		{"p256dh corto", base64.RawURLEncoding.EncodeToString(p256[:64]), rawA, false},
		{"auth largo", rawP, base64.RawURLEncoding.EncodeToString(make([]byte, 17)), false},
		{"base64 estándar con +/", strings.Repeat("+/", 44), rawA, false},
		{"basura", "!!!", "???", false},
		{"enorme", strings.Repeat("A", 5000), rawA, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, ValidPushKeys(tc.p256dh, tc.auth))
		})
	}
}
