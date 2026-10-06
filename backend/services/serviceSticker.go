package services

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"fmt"
	"image/png"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/minio/minio-go/v7"
	"golang.org/x/image/webp"
)

// Límites del sticker (ver odd/tasks/stickers-full.md, decisión SF1).
const (
	// stickerDimension es el lado exacto que debe tener el sticker.
	stickerDimension = 512
	// stickerStaticMaxBytes es el tope para un sticker estático (PNG o WebP).
	stickerStaticMaxBytes = 300 * 1024
	// stickerAnimatedMaxBytes es el tope para un WebP animado.
	stickerAnimatedMaxBytes = 1024 * 1024
	// stickerPrefix es el prefijo de objeto de los stickers subidos.
	stickerPrefix = "stickers/"
	// stickerUploadTimeout acota la subida a MinIO.
	stickerUploadTimeout = 60 * time.Second
)

// stickerInfo describe un sticker ya validado.
type stickerInfo struct {
	mimeType string
	ext      string
	width    int
	height   int
	animated bool
}

// StickerObjectStore es la parte del cliente MinIO que usa el servicio de
// stickers. *minio.Client la satisface; en los tests se inyecta un doble.
type StickerObjectStore interface {
	StatObject(ctx context.Context, bucketName, objectName string, opts minio.StatObjectOptions) (minio.ObjectInfo, error)
	PutObject(ctx context.Context, bucketName, objectName string, reader io.Reader, objectSize int64, opts minio.PutObjectOptions) (minio.UploadInfo, error)
}

// StickerUploadResult es el resultado de guardar un sticker.
type StickerUploadResult struct {
	URL      string
	SHA256   string
	Animated bool
	MimeType string
	Size     int64
}

// StickerServicer sube y deduplica stickers por contenido.
type StickerServicer interface {
	UploadSticker(file multipart.File, header *multipart.FileHeader, ctx context.Context) (StickerUploadResult, error)
}

// ServiceSticker valida stickers y los guarda con una clave direccionada por
// contenido (SHA-256), de modo que bytes idénticos se almacenan una sola vez.
type ServiceSticker struct {
	store   StickerObjectStore
	bucket  string
	baseURL string
}

// InitServiceSticker construye el servicio con el cliente MinIO, devolviendo la
// interfaz StickerServicer.
func InitServiceSticker(client *minio.Client) StickerServicer {
	return NewServiceSticker(client)
}

// NewServiceSticker crea el servicio concreto. El bucket y la URL pública se
// leen del entorno igual que en ServiceMedia.
func NewServiceSticker(store StickerObjectStore) *ServiceSticker {
	bucket := os.Getenv("MINIO_BUCKET")
	if bucket == "" {
		bucket = "media"
	}
	return &ServiceSticker{
		store:   store,
		bucket:  bucket,
		baseURL: strings.TrimRight(os.Getenv("MEDIA_PUBLIC_BASE_URL"), "/"),
	}
}

// UploadSticker valida el archivo, calcula su SHA-256 y, si el objeto aún no
// existe en el almacenamiento, lo sube. Devuelve la URL pública del sticker.
func (s *ServiceSticker) UploadSticker(file multipart.File, header *multipart.FileHeader, ctx context.Context) (StickerUploadResult, error) {
	data, err := io.ReadAll(io.LimitReader(file, stickerAnimatedMaxBytes+1))
	if err != nil {
		return StickerUploadResult{}, fmt.Errorf("no se pudo leer el sticker: %w", err)
	}
	info, err := validateSticker(data)
	if err != nil {
		return StickerUploadResult{}, err
	}

	sum := sha256.Sum256(data)
	sha := hex.EncodeToString(sum[:])
	key := stickerObjectKey(sha, info.ext)

	// Dedupe: solo se sube si la clave content-addressed no existe todavía.
	if _, err := s.store.StatObject(ctx, s.bucket, key, minio.StatObjectOptions{}); err != nil {
		if minio.ToErrorResponse(err).Code != "NoSuchKey" {
			return StickerUploadResult{}, fmt.Errorf("error verificando el sticker en almacenamiento: %w", err)
		}
		uploadCtx, cancel := context.WithTimeout(ctx, stickerUploadTimeout)
		defer cancel()
		if _, err := s.store.PutObject(uploadCtx, s.bucket, key, bytes.NewReader(data), int64(len(data)), minio.PutObjectOptions{ContentType: info.mimeType}); err != nil {
			return StickerUploadResult{}, fmt.Errorf("error subiendo el sticker a almacenamiento: %w", err)
		}
	}

	return StickerUploadResult{
		URL:      stickerObjectURL(s.bucket, s.baseURL, key),
		SHA256:   sha,
		Animated: info.animated,
		MimeType: info.mimeType,
		Size:     int64(len(data)),
	}, nil
}

// validateSticker comprueba tipo, dimensiones y tamaño de un sticker. Acepta
// WebP (estático o animado) y, como fallback de Safari, PNG 512x512 estático.
func validateSticker(data []byte) (stickerInfo, error) {
	if len(data) == 0 {
		return stickerInfo{}, errors.New("el sticker está vacío")
	}
	info, err := stickerHeader(data)
	if err != nil {
		return stickerInfo{}, err
	}
	if info.width != stickerDimension || info.height != stickerDimension {
		return stickerInfo{}, fmt.Errorf(
			"el sticker debe medir exactamente %dx%d píxeles (recibido %dx%d)",
			stickerDimension, stickerDimension, info.width, info.height,
		)
	}
	maxBytes := int64(stickerStaticMaxBytes)
	if info.animated {
		maxBytes = stickerAnimatedMaxBytes
	}
	if int64(len(data)) > maxBytes {
		return stickerInfo{}, fmt.Errorf("el sticker supera el tamaño máximo permitido (%d KB)", maxBytes/1024)
	}
	return info, nil
}

// stickerHeader detecta el tipo real por firma, rechaza HTML/XML/SVG como
// verifyContent y decodifica la cabecera para leer dimensiones y animación.
func stickerHeader(data []byte) (stickerInfo, error) {
	detected := http.DetectContentType(data)
	if strings.HasPrefix(detected, "text/html") || strings.Contains(detected, "xml") {
		return stickerInfo{}, errors.New("contenido de archivo no permitido")
	}
	switch detected {
	case "image/webp":
		cfg, err := webp.DecodeConfig(bytes.NewReader(data))
		if err != nil {
			return stickerInfo{}, errors.New("el archivo no es un WebP válido")
		}
		return stickerInfo{
			mimeType: "image/webp",
			ext:      ".webp",
			width:    cfg.Width,
			height:   cfg.Height,
			animated: webpIsAnimated(data),
		}, nil
	case "image/png":
		cfg, err := png.DecodeConfig(bytes.NewReader(data))
		if err != nil {
			return stickerInfo{}, errors.New("el archivo no es un PNG válido")
		}
		return stickerInfo{
			mimeType: "image/png",
			ext:      ".png",
			width:    cfg.Width,
			height:   cfg.Height,
		}, nil
	default:
		return stickerInfo{}, errors.New("formato de sticker no válido: se requiere WebP o PNG")
	}
}

// webpIsAnimated recorre los chunks RIFF y devuelve true si el chunk VP8X tiene
// el flag ANIM (bit 1). x/image no expone este flag, así que se lee a mano.
func webpIsAnimated(data []byte) bool {
	if len(data) < 12 || string(data[0:4]) != "RIFF" || string(data[8:12]) != "WEBP" {
		return false
	}
	for off := 12; off+8 <= len(data); {
		id := string(data[off : off+4])
		size := int(binary.LittleEndian.Uint32(data[off+4 : off+8]))
		payload := off + 8
		if id == "VP8X" {
			return size >= 1 && payload < len(data) && data[payload]&0x02 != 0
		}
		if size < 0 || size > len(data)-payload {
			return false
		}
		off = payload + size + size%2 // los chunks se alinean a 2 bytes
	}
	return false
}

// stickerObjectKey construye la clave content-addressed del sticker.
func stickerObjectKey(sha, ext string) string {
	return stickerPrefix + sha + ext
}

// stickerObjectURL construye la URL pública, relativa o sobre la base pública.
func stickerObjectURL(bucket, baseURL, key string) string {
	if baseURL != "" {
		return baseURL + "/" + key
	}
	return "/storage/" + bucket + "/" + key
}
