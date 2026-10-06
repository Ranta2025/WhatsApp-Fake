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

func TestIsStickerStorageURL(t *testing.T) {
	sha := strings.Repeat("a", 64)
	cases := map[string]bool{
		"/storage/media/stickers/" + sha + ".webp": true,
		"/storage/media/stickers/" + sha + ".png":  true,
		// Absolute URLs are no longer accepted here; the service layer pins
		// them to MEDIA_PUBLIC_BASE_URL.
		"https://pub-x.r2.dev/stickers/" + sha + ".webp": false,
		"https://pub-x.r2.dev/stickers/" + sha + ".png":  false,
		// External hosts with a valid 64-hex name must stay rejected.
		"https://evil-host/stickers/" + sha + ".webp":                  false,
		"http://evil-host/stickers/" + sha + ".png":                    false,
		"/storage/media/stickers/" + sha + ".svg":                      false,
		"/storage/media/stickers/" + sha + ".gif":                      false,
		"/storage/media/stickers/" + sha + ".WebP":                     false,
		"/storage/media/stickers/" + strings.Repeat("a", 63) + ".webp": false,
		"/storage/media/stickers/" + strings.Repeat("z", 64) + ".webp": false,
		"/storage/media/images/" + sha + ".webp":                       false,
		"/stickers/basic/hola.webp":                                    false,
		"https://evil.com/cat.webp":                                    false,
		"javascript:alert(1)":                                          false,
		"/storage/media/stickers/../" + sha + ".webp":                  false,
		"": false,
	}
	for url, want := range cases {
		if got := IsStickerStorageURL(url); got != want {
			t.Errorf("IsStickerStorageURL(%q) = %v, want %v", url, got, want)
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
