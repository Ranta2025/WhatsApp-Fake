package utils

import (
	"strings"
	"testing"
)

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

func TestIsBuiltinStickerURL(t *testing.T) {
	cases := map[string]bool{
		"/stickers/basic/hola.webp":                            true,
		"/stickers/basic/123-abc.webp":                         true,
		"":                                                     false,
		"/stickers/../x.webp":                                  false,
		"/stickers/basic/hola.webp?x=1":                        false,
		"/stickers/Basic/hola.webp":                            false,
		"/stickers/basic/HOLA.webp":                            false,
		"/stickers/basic/hola.svg":                             false,
		"/stickers/basic/hola.webp/extra":                      false,
		"https://example.com/stickers/basic/a.webp":            false,
		"/stickers/basic/" + strings.Repeat("a", 61) + ".webp": false,
	}
	for url, want := range cases {
		if got := IsBuiltinStickerURL(url); got != want {
			t.Errorf("IsBuiltinStickerURL(%q) = %v, want %v", url, got, want)
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
