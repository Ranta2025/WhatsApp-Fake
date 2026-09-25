package config

import "testing"

func TestIsAllowedOrigin(t *testing.T) {
	cases := map[string]bool{
		"http://localhost:5173":           true,
		"https://abc.ngrok-free.app":      true,
		"https://abc.ngrok-free.dev":      true,
		"https://foo.trycloudflare.com":   true,
		"https://evilngrok-free.dev":      false,
		"https://ngrok-free.app.evil.com": false,
		"https://eviltrycloudflare.com":   false,
		"http://localhost:3000":           false,
		"":                                false,
	}
	for origin, want := range cases {
		if got := IsAllowedOrigin(origin); got != want {
			t.Errorf("IsAllowedOrigin(%q) = %v, want %v", origin, got, want)
		}
	}
}
