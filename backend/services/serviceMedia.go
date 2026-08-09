package services

import (
	"context"
	"fmt"
	"io"
	"mime/multipart"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/rs/xid"
)

var allowedTypes = map[string]mediaConfig{
	"image/jpeg":      {folder: "images", ext: ".jpg", maxBytes: 10 * 1024 * 1024},
	"image/png":       {folder: "images", ext: ".png", maxBytes: 10 * 1024 * 1024},
	"image/gif":       {folder: "images", ext: ".gif", maxBytes: 10 * 1024 * 1024},
	"image/webp":      {folder: "images", ext: ".webp", maxBytes: 10 * 1024 * 1024},
	"audio/ogg":       {folder: "audio", ext: ".ogg", maxBytes: 25 * 1024 * 1024},
	"audio/mpeg":      {folder: "audio", ext: ".mp3", maxBytes: 25 * 1024 * 1024},
	"audio/webm":      {folder: "audio", ext: ".webm", maxBytes: 25 * 1024 * 1024},
	"audio/wav":       {folder: "audio", ext: ".wav", maxBytes: 25 * 1024 * 1024},
	"video/mp4":       {folder: "videos", ext: ".mp4", maxBytes: 100 * 1024 * 1024},
	"video/webm":      {folder: "videos", ext: ".webm", maxBytes: 100 * 1024 * 1024},
	"video/quicktime": {folder: "videos", ext: ".mov", maxBytes: 100 * 1024 * 1024},
	"application/pdf":    {folder: "docs", ext: ".pdf", maxBytes: 10 * 1024 * 1024},
	"application/msword": {folder: "docs", ext: ".doc", maxBytes: 10 * 1024 * 1024},
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document": {folder: "docs", ext: ".docx", maxBytes: 10 * 1024 * 1024},
	"application/vnd.ms-excel": {folder: "docs", ext: ".xls", maxBytes: 10 * 1024 * 1024},
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":         {folder: "docs", ext: ".xlsx", maxBytes: 10 * 1024 * 1024},
	"application/vnd.ms-powerpoint":                                             {folder: "docs", ext: ".ppt", maxBytes: 10 * 1024 * 1024},
	"application/vnd.openxmlformats-officedocument.presentationml.presentation": {folder: "docs", ext: ".pptx", maxBytes: 10 * 1024 * 1024},
	"text/plain": {folder: "docs", ext: ".txt", maxBytes: 10 * 1024 * 1024},
}

type mediaConfig struct {
	folder   string
	ext      string
	maxBytes int64
}

type MediaUploadResult struct {
	URL       string `json:"url"`
	MediaType string `json:"mediaType"`
	MimeType  string `json:"mimeType"`
	Size      int64  `json:"size"`
	Filename  string `json:"filename"`
}

type ObjectStorer interface {
	PutObject(ctx context.Context, bucketName, objectName string, reader io.Reader, objectSize int64, opts minio.PutObjectOptions) (minio.UploadInfo, error)
}

type MediaServicer interface {
	UploadMedia(file multipart.File, header *multipart.FileHeader, ctx context.Context) (MediaUploadResult, error)
}

type ServiceMedia struct {
	storage ObjectStorer
	bucket  string
	baseURL string
}

func InitServiceMedia(storage ObjectStorer) MediaServicer {
	bucket := os.Getenv("MINIO_BUCKET")
	if bucket == "" {
		bucket = "media"
	}
	baseURL := os.Getenv("MINIO_PUBLIC_URL")
	if baseURL == "" {
		baseURL = "http://localhost:9000"
	}
	return &ServiceMedia{
		storage: storage,
		bucket:  bucket,
		baseURL: strings.TrimRight(baseURL, "/"),
	}
}

func (s *ServiceMedia) UploadMedia(file multipart.File, header *multipart.FileHeader, ctx context.Context) (MediaUploadResult, error) {
	mimeType := header.Header.Get("Content-Type")
	if mimeType == "" || mimeType == "application/octet-stream" {
		mimeType = mimeByExtension(filepath.Ext(header.Filename))
	}

	cfg, allowed := allowedTypes[mimeType]
	if !allowed {
		return MediaUploadResult{}, fmt.Errorf("formato de archivo no permitido: %s. Solo se permiten imágenes, videos y documentos estándar (Word, PDF, Excel, PPT, TXT)", mimeType)
	}

	if header.Size > cfg.maxBytes {
		return MediaUploadResult{}, fmt.Errorf(
			"archivo demasiado grande: %.2f MB (máximo %d MB)",
			float64(header.Size)/1024/1024,
			cfg.maxBytes/1024/1024,
		)
	}

	yearMonth := time.Now().Format("2006-01")
	uniqueID := xid.New().String()
	objectName := fmt.Sprintf("%s/%s/%s%s", cfg.folder, yearMonth, uniqueID, cfg.ext)

	uploadCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()

	_, err := s.storage.PutObject(uploadCtx, s.bucket, objectName, file, header.Size, minio.PutObjectOptions{
		ContentType: mimeType,
	})
	if err != nil {
		return MediaUploadResult{}, fmt.Errorf("error subiendo archivo a almacenamiento: %w", err)
	}

	url := fmt.Sprintf("/storage/%s/%s", s.bucket, objectName)

	mediaType := "document"
	switch cfg.folder {
	case "images":
		mediaType = "image"
	case "audio":
		mediaType = "audio"
	case "videos":
		mediaType = "video"
	case "docs":
		mediaType = "document"
	}

	return MediaUploadResult{
		URL:       url,
		MediaType: mediaType,
		MimeType:  mimeType,
		Size:      header.Size,
		Filename:  objectName,
	}, nil
}

func mimeByExtension(ext string) string {
	ext = strings.ToLower(ext)
	switch ext {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".gif":
		return "image/gif"
	case ".webp":
		return "image/webp"
	case ".ogg":
		return "audio/ogg"
	case ".mp3":
		return "audio/mpeg"
	case ".wav":
		return "audio/wav"
	case ".mp4":
		return "video/mp4"
	case ".webm":
		return "video/webm"
	case ".mov":
		return "video/quicktime"
	case ".pdf":
		return "application/pdf"
	case ".doc":
		return "application/msword"
	case ".docx":
		return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
	case ".xls":
		return "application/vnd.ms-excel"
	case ".xlsx":
		return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
	case ".ppt":
		return "application/vnd.ms-powerpoint"
	case ".pptx":
		return "application/vnd.openxmlformats-officedocument.presentationml.presentation"
	case ".txt":
		return "text/plain"
	default:
		return "application/octet-stream"
	}
}
