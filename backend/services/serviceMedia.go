package services

import (
	"context"
	"fmt"
	"mime/multipart"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/rs/xid"
)

// Tipos MIME permitidos y sus carpetas + límites de tamaño
// Se han ajustado los límites de documentos a 10MB según requerimiento.
var allowedTypes = map[string]mediaConfig{
	"image/jpeg":      {folder: "images", ext: ".jpg", maxBytes: 10 * 1024 * 1024},   // 10 MB
	"image/png":       {folder: "images", ext: ".png", maxBytes: 10 * 1024 * 1024},   // 10 MB
	"image/gif":       {folder: "images", ext: ".gif", maxBytes: 10 * 1024 * 1024},   // 10 MB
	"image/webp":      {folder: "images", ext: ".webp", maxBytes: 10 * 1024 * 1024},  // 10 MB
	"audio/ogg":       {folder: "audio", ext: ".ogg", maxBytes: 25 * 1024 * 1024},    // 25 MB (voz)
	"audio/mpeg":      {folder: "audio", ext: ".mp3", maxBytes: 25 * 1024 * 1024},    // 25 MB
	"audio/webm":      {folder: "audio", ext: ".webm", maxBytes: 25 * 1024 * 1024},   // 25 MB (voz desde browser)
	"audio/wav":       {folder: "audio", ext: ".wav", maxBytes: 25 * 1024 * 1024},    // 25 MB
	"video/mp4":       {folder: "videos", ext: ".mp4", maxBytes: 100 * 1024 * 1024},  // 100 MB
	"video/webm":      {folder: "videos", ext: ".webm", maxBytes: 100 * 1024 * 1024}, // 100 MB
	"video/quicktime": {folder: "videos", ext: ".mov", maxBytes: 100 * 1024 * 1024},  // 100 MB
	// Documentos (Limitados a 10MB)
	"application/pdf":    {folder: "docs", ext: ".pdf", maxBytes: 10 * 1024 * 1024}, // 10 MB
	"application/msword": {folder: "docs", ext: ".doc", maxBytes: 10 * 1024 * 1024}, // 10 MB
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document": {folder: "docs", ext: ".docx", maxBytes: 10 * 1024 * 1024}, // 10 MB
	"application/vnd.ms-excel": {folder: "docs", ext: ".xls", maxBytes: 10 * 1024 * 1024}, // 10 MB
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":         {folder: "docs", ext: ".xlsx", maxBytes: 10 * 1024 * 1024}, // 10 MB
	"application/vnd.ms-powerpoint":                                             {folder: "docs", ext: ".ppt", maxBytes: 10 * 1024 * 1024},  // 10 MB
	"application/vnd.openxmlformats-officedocument.presentationml.presentation": {folder: "docs", ext: ".pptx", maxBytes: 10 * 1024 * 1024}, // 10 MB
	"text/plain": {folder: "docs", ext: ".txt", maxBytes: 10 * 1024 * 1024}, // 10 MB
}

type mediaConfig struct {
	folder   string
	ext      string
	maxBytes int64
}

// MediaUploadResult es el resultado de subir un archivo
type MediaUploadResult struct {
	URL       string `json:"url"`
	MediaType string `json:"mediaType"` // "image", "audio", "video", "document"
	MimeType  string `json:"mimeType"`
	Size      int64  `json:"size"`
	Filename  string `json:"filename"`
}

type MediaServicer interface {
	UploadMedia(file multipart.File, header *multipart.FileHeader, ctx context.Context) (MediaUploadResult, error)
}

type ServiceMedia struct {
	client  *minio.Client
	bucket  string
	baseURL string
}

// InitServiceMedia crea el servicio de medios con el cliente MinIO, devolviendo la interfaz MediaServicer.
func InitServiceMedia(client *minio.Client) MediaServicer {
	bucket := os.Getenv("MINIO_BUCKET")
	if bucket == "" {
		bucket = "media"
	}
	baseURL := os.Getenv("MINIO_PUBLIC_URL")
	if baseURL == "" {
		baseURL = "http://localhost:9000"
	}
	return &ServiceMedia{
		client:  client,
		bucket:  bucket,
		baseURL: strings.TrimRight(baseURL, "/"),
	}
}

// UploadMedia valida el tipo MIME, sube el archivo a MinIO con un nombre único
// y devuelve la URL relativa pública junto con metadatos del archivo.
func (s *ServiceMedia) UploadMedia(file multipart.File, header *multipart.FileHeader, ctx context.Context) (MediaUploadResult, error) {
	// 1. Detectar MIME type
	mimeType := header.Header.Get("Content-Type")
	if mimeType == "" || mimeType == "application/octet-stream" {
		mimeType = mimeByExtension(filepath.Ext(header.Filename))
	}

	// 2. Validar tipo permitido
	cfg, allowed := allowedTypes[mimeType]
	if !allowed {
		return MediaUploadResult{}, fmt.Errorf("formato de archivo no permitido: %s. Solo se permiten imágenes, videos y documentos estándar (Word, PDF, Excel, PPT, TXT)", mimeType)
	}

	// 3. Validar tamaño
	if header.Size > cfg.maxBytes {
		return MediaUploadResult{}, fmt.Errorf(
			"archivo demasiado grande: %.2f MB (máximo %d MB)",
			float64(header.Size)/1024/1024,
			cfg.maxBytes/1024/1024,
		)
	}

	// 4. Generar nombre único: carpeta/año-mes/id-único.ext
	yearMonth := time.Now().Format("2006-01")
	uniqueID := xid.New().String()
	objectName := fmt.Sprintf("%s/%s/%s%s", cfg.folder, yearMonth, uniqueID, cfg.ext)

	// 5. Subir a MinIO
	uploadCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()

	_, err := s.client.PutObject(uploadCtx, s.bucket, objectName, file, header.Size, minio.PutObjectOptions{
		ContentType: mimeType,
	})
	if err != nil {
		return MediaUploadResult{}, fmt.Errorf("error subiendo archivo a almacenamiento: %w", err)
	}

	// 6. Construir URL relativa
	url := fmt.Sprintf("/storage/%s/%s", s.bucket, objectName)

	// 7. Determinar mediaType genérico
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

// mimeByExtension infiere el MIME type por extensión de archivo
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
