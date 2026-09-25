package utils

import "testing"

func TestIsSafeMediaURL(t *testing.T) {
	cases := map[string]bool{
		"/storage/media/images/2026-09/abc.jpg": true,
		"https://example.com/a.png":             true,
		"http://localhost:9000/media/a.png":     true,
		"javascript:alert(1)":                   false,
		"JaVaScRiPt:alert(1)":                   false,
		"data:text/html;base64,PHNjcmlwdD4=":    false,
		"/storage/../etc/passwd":                false,
		"//evil.com/a.png":                      false,
		"":                                      false,
	}
	for url, want := range cases {
		if got := IsSafeMediaURL(url); got != want {
			t.Errorf("IsSafeMediaURL(%q) = %v, want %v", url, got, want)
		}
	}
}

func TestIsValidMediaType(t *testing.T) {
	for _, mt := range []string{"", "image", "audio", "video", "sticker", "document"} {
		if !IsValidMediaType(mt) {
			t.Errorf("IsValidMediaType(%q) = false", mt)
		}
	}
	if IsValidMediaType("exe") {
		t.Error(`IsValidMediaType("exe") = true`)
	}
}
