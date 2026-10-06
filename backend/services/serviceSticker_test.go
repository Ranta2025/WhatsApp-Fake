package services

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"mime/multipart"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/minio/minio-go/v7"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// loadStickerFixture reads a committed fixture from testdata/.
func loadStickerFixture(t *testing.T, name string) []byte {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("testdata", name))
	require.NoError(t, err, "fixture %s", name)
	return data
}

// paddedSticker grows a valid sticker with trailing bytes to exercise the size
// caps without committing oversized binaries.
func paddedSticker(base []byte, size int) []byte {
	b := make([]byte, size)
	copy(b, base)
	return b
}

// memStickerFile adapts a byte slice to multipart.File for UploadSticker tests.
type memStickerFile struct{ *bytes.Reader }

func (memStickerFile) Close() error { return nil }

func memStickerFileOf(b []byte) multipart.File { return memStickerFile{bytes.NewReader(b)} }

func TestValidateSticker(t *testing.T) {
	static := loadStickerFixture(t, "sticker_static_512.webp")
	animated := loadStickerFixture(t, "sticker_anim_512.webp")
	pngSmall := loadStickerFixture(t, "sticker_png_small_512.png")

	tests := []struct {
		name     string
		data     []byte
		wantErr  bool
		wantExt  string
		wantMIME string
		animated bool
	}{
		{name: "static webp 512", data: static, wantExt: ".webp", wantMIME: "image/webp"},
		{name: "animated webp 512", data: animated, wantExt: ".webp", wantMIME: "image/webp", animated: true},
		{name: "png fallback 512", data: pngSmall, wantExt: ".png", wantMIME: "image/png"},
		{name: "wrong dimensions", data: loadStickerFixture(t, "sticker_static_256.webp"), wantErr: true},
		{name: "static over 300KB", data: paddedSticker(static, stickerStaticMaxBytes+1), wantErr: true},
		{name: "animated over 1MB", data: paddedSticker(animated, stickerAnimatedMaxBytes+1), wantErr: true},
		{name: "png over 300KB", data: paddedSticker(pngSmall, stickerStaticMaxBytes+1), wantErr: true},
		// Boundary cases: exact-at-cap is accepted; an animated WebP is allowed
		// above the static cap but within its own cap; a static image between the
		// two caps is rejected (the "static over 300KB" case above covers it).
		{name: "static exactly at cap", data: paddedSticker(static, stickerStaticMaxBytes), wantExt: ".webp", wantMIME: "image/webp"},
		{name: "animated exactly at cap", data: paddedSticker(animated, stickerAnimatedMaxBytes), wantExt: ".webp", wantMIME: "image/webp", animated: true},
		{name: "animated above static cap within animated cap", data: paddedSticker(animated, stickerStaticMaxBytes+1), wantExt: ".webp", wantMIME: "image/webp", animated: true},
		{name: "html", data: []byte("<!DOCTYPE html><html><body>hi</body></html>"), wantErr: true},
		{name: "svg", data: []byte(`<svg xmlns="http://www.w3.org/2000/svg"></svg>`), wantErr: true},
		{name: "xml", data: []byte(`<?xml version="1.0"?><root/>`), wantErr: true},
		{name: "empty", data: nil, wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			info, err := validateSticker(tt.data)
			if tt.wantErr {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tt.wantExt, info.ext)
			assert.Equal(t, tt.wantMIME, info.mimeType)
			assert.Equal(t, tt.animated, info.animated)
			assert.Equal(t, stickerDimension, info.width)
			assert.Equal(t, stickerDimension, info.height)
		})
	}
}

func TestValidateStickerErrorsAreSpanish(t *testing.T) {
	pngSmall := loadStickerFixture(t, "sticker_png_small_512.png")

	_, err := validateSticker(loadStickerFixture(t, "sticker_static_256.webp"))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "512x512")

	_, err = validateSticker(paddedSticker(pngSmall, stickerStaticMaxBytes+1))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "tamaño")
}

func TestWebpIsAnimated(t *testing.T) {
	vp8x := func(flag byte) []byte {
		b := make([]byte, 30)
		copy(b[0:], "RIFF")
		copy(b[8:], "WEBP")
		copy(b[12:], "VP8X")
		b[16] = 10 // VP8X payload size, little-endian
		b[20] = flag
		return b
	}

	tests := []struct {
		name string
		data []byte
		want bool
	}{
		{name: "anim flag set", data: vp8x(0x02), want: true},
		{name: "anim plus alpha", data: vp8x(0x12), want: true},
		{name: "no flags", data: vp8x(0x00), want: false},
		{name: "alpha only", data: vp8x(0x10), want: false},
		{name: "no vp8x chunk", data: []byte("RIFF\x00\x00\x00\x00WEBPVP8 \x00\x00\x00\x00"), want: false},
		{name: "too short", data: []byte("RIFF"), want: false},
		{name: "bad container", data: []byte("NOPEnopeNOPE"), want: false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, webpIsAnimated(tt.data))
		})
	}
}

func TestStickerObjectKeyAndURL(t *testing.T) {
	sha := strings.Repeat("a", 64)
	key := "stickers/" + sha + ".webp"

	assert.Equal(t, key, stickerObjectKey(sha, ".webp"))
	assert.Equal(t, "stickers/"+sha+".png", stickerObjectKey(sha, ".png"))
	assert.Equal(t, "/storage/media/"+key, stickerObjectURL("media", "", key))
	assert.Equal(t, "https://pub-x.r2.dev/"+key, stickerObjectURL("media", "https://pub-x.r2.dev", key))
}

// fakeStickerStore implements StickerObjectStore for UploadSticker tests.
type fakeStickerStore struct {
	statErr  error
	putErr   error
	statKeys []string
	putKeys  []string
	putData  []byte
	putCT    string
	putSize  int64
}

func (f *fakeStickerStore) StatObject(_ context.Context, _, object string, _ minio.StatObjectOptions) (minio.ObjectInfo, error) {
	f.statKeys = append(f.statKeys, object)
	return minio.ObjectInfo{}, f.statErr
}

func (f *fakeStickerStore) PutObject(_ context.Context, _, object string, r io.Reader, size int64, opts minio.PutObjectOptions) (minio.UploadInfo, error) {
	f.putKeys = append(f.putKeys, object)
	b, _ := io.ReadAll(r)
	f.putData = b
	f.putCT = opts.ContentType
	f.putSize = size
	return minio.UploadInfo{}, f.putErr
}

func TestUploadSticker_ContentAddressedDedupe(t *testing.T) {
	t.Setenv("MINIO_BUCKET", "media")
	t.Setenv("MEDIA_PUBLIC_BASE_URL", "")

	data := loadStickerFixture(t, "sticker_static_512.webp")
	sum := sha256.Sum256(data)
	sha := hex.EncodeToString(sum[:])
	wantKey := "stickers/" + sha + ".webp"
	wantURL := "/storage/media/" + wantKey

	t.Run("uploads on cache miss", func(t *testing.T) {
		store := &fakeStickerStore{statErr: minio.ErrorResponse{Code: "NoSuchKey"}}
		res, err := NewServiceSticker(store).UploadSticker(memStickerFileOf(data), &multipart.FileHeader{Size: int64(len(data))}, context.Background())
		require.NoError(t, err)
		assert.Equal(t, []string{wantKey}, store.statKeys)
		assert.Equal(t, []string{wantKey}, store.putKeys)
		assert.Equal(t, data, store.putData)
		assert.Equal(t, "image/webp", store.putCT)
		assert.Equal(t, int64(len(data)), store.putSize)
		assert.Equal(t, wantURL, res.URL)
		assert.Equal(t, sha, res.SHA256)
		assert.False(t, res.Animated)
		assert.Equal(t, "image/webp", res.MimeType)
	})

	t.Run("skips upload on cache hit", func(t *testing.T) {
		store := &fakeStickerStore{}
		res, err := NewServiceSticker(store).UploadSticker(memStickerFileOf(data), &multipart.FileHeader{Size: int64(len(data))}, context.Background())
		require.NoError(t, err)
		assert.Equal(t, []string{wantKey}, store.statKeys)
		assert.Empty(t, store.putKeys)
		assert.Equal(t, wantURL, res.URL)
	})

	t.Run("animated uses png key extension only for png", func(t *testing.T) {
		store := &fakeStickerStore{statErr: minio.ErrorResponse{Code: "NoSuchKey"}}
		png := loadStickerFixture(t, "sticker_png_small_512.png")
		res, err := NewServiceSticker(store).UploadSticker(memStickerFileOf(png), &multipart.FileHeader{Size: int64(len(png))}, context.Background())
		require.NoError(t, err)
		assert.Equal(t, "image/png", res.MimeType)
		assert.True(t, strings.HasSuffix(store.putKeys[0], ".png"))
	})
}

func TestUploadSticker_RejectsInvalidWithoutTouchingStorage(t *testing.T) {
	t.Setenv("MINIO_BUCKET", "media")
	store := &fakeStickerStore{}
	_, err := NewServiceSticker(store).UploadSticker(memStickerFileOf([]byte("not an image")), &multipart.FileHeader{Size: 12}, context.Background())
	require.Error(t, err)
	assert.Empty(t, store.statKeys)
	assert.Empty(t, store.putKeys)
}

func TestUploadSticker_StatErrorIsReported(t *testing.T) {
	t.Setenv("MINIO_BUCKET", "media")
	data := loadStickerFixture(t, "sticker_static_512.webp")
	store := &fakeStickerStore{statErr: assert.AnError}
	_, err := NewServiceSticker(store).UploadSticker(memStickerFileOf(data), &multipart.FileHeader{Size: int64(len(data))}, context.Background())
	require.Error(t, err)
	assert.Empty(t, store.putKeys)
}

func TestUploadSticker_PutErrorIsReported(t *testing.T) {
	t.Setenv("MINIO_BUCKET", "media")
	data := loadStickerFixture(t, "sticker_static_512.webp")
	store := &fakeStickerStore{
		statErr: minio.ErrorResponse{Code: "NoSuchKey"},
		putErr:  assert.AnError,
	}
	_, err := NewServiceSticker(store).UploadSticker(memStickerFileOf(data), &multipart.FileHeader{Size: int64(len(data))}, context.Background())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "subiendo")
	assert.Len(t, store.putKeys, 1)
}

func TestUploadSticker_AnimatedUsesAnimatedCap(t *testing.T) {
	t.Setenv("MINIO_BUCKET", "media")
	t.Setenv("MEDIA_PUBLIC_BASE_URL", "")

	// Above the static cap, only accepted because it is an animated WebP.
	data := paddedSticker(loadStickerFixture(t, "sticker_anim_512.webp"), stickerStaticMaxBytes+1)
	sum := sha256.Sum256(data)
	sha := hex.EncodeToString(sum[:])
	store := &fakeStickerStore{statErr: minio.ErrorResponse{Code: "NoSuchKey"}}

	res, err := NewServiceSticker(store).UploadSticker(memStickerFileOf(data), &multipart.FileHeader{Size: int64(len(data))}, context.Background())
	require.NoError(t, err)
	assert.True(t, res.Animated)
	assert.Equal(t, "stickers/"+sha+".webp", store.putKeys[0])
	assert.Equal(t, "image/webp", res.MimeType)
	assert.Equal(t, int64(len(data)), res.Size)
	assert.Equal(t, "/storage/media/stickers/"+sha+".webp", res.URL)
}
