package services

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"mime/multipart"
	"strings"
	"time"
	"unicode/utf8"

	"gorm/backend/models"
	"gorm/backend/utils"

	"github.com/minio/minio-go/v7"
)

// Sentinels de la biblioteca de stickers: el handler los distingue con
// errors.Is() para elegir el código HTTP.
var (
	// ErrStickerLimit: el usuario alcanzó el tope de stickers propios (409).
	ErrStickerLimit = errors.New("alcanzaste el límite de 200 stickers propios; borra alguno para subir otro")
	// ErrStickerSaveURLInvalid: la URL no es un sticker subido por la app (400).
	ErrStickerSaveURLInvalid = errors.New("solo puedes guardar stickers subidos con la app")
	// ErrStickerBuiltinFavorite: una URL integrada no se guarda en "Mis
	// stickers"; va a favoritos (400).
	ErrStickerBuiltinFavorite = errors.New("los stickers integrados se añaden a favoritos, no a tus stickers")
	// ErrStickerFavoriteInvalid: el favorito no es propio ni integrado (400).
	ErrStickerFavoriteInvalid = errors.New("solo puedes marcar como favorito un sticker integrado o propio")
	// ErrStickerInvalid: el archivo no es un sticker válido (dimensiones,
	// tamaño, formato). El motivo real va en el mensaje.
	ErrStickerInvalid = errors.New("sticker no válido")
)

// StickerRepoInterface es el subconjunto del repositorio de stickers que
// necesita el servicio.
type StickerRepoInterface interface {
	GetIdByTelephon(telephon string, ctx context.Context) (int, error)
	CountStickers(ownerID uint, ctx context.Context) (int64, error)
	GetStickerBySHA(ownerID uint, sha256 string, ctx context.Context) (*models.UserSticker, error)
	GetStickerByURL(ownerID uint, url string, ctx context.Context) (*models.UserSticker, error)
	GetStickerByID(ownerID, id uint, ctx context.Context) (*models.UserSticker, error)
	CreateSticker(s *models.UserSticker, ctx context.Context) (models.UserSticker, bool, error)
	ListStickers(ownerID uint, limit int, ctx context.Context) ([]models.UserSticker, error)
	SetStickerFavorite(ownerID, id uint, favorite bool, ctx context.Context) error
	SoftDeleteSticker(ownerID, id uint, ctx context.Context) (bool, error)
	// GC compartida con el job de expiración: comprobar si el objeto sigue
	// referenciado y encolarlo para su borrado.
	MediaKeyReferenced(ctx context.Context, key string) (bool, error)
	EnqueueMediaGC(ctx context.Context, key string) error
	UpsertFavorite(f *models.StickerFavorite, ctx context.Context) error
	DeleteFavorite(ownerID uint, url string, ctx context.Context) error
	ListFavorites(ownerID uint, limit int, ctx context.Context) ([]models.StickerFavorite, error)
	UpsertRecent(ownerID uint, url string, now time.Time, ctx context.Context) error
	ListRecents(ownerID uint, limit int, ctx context.Context) ([]models.StickerRecent, error)
}

// stickerObjectReader lee el contenido de un objeto almacenado. Es la parte que
// necesita SaveSticker para derivar el flag animated de los bytes reales (RF1).
// *minio.Client no la satisface directamente porque GetObject devuelve un
// *minio.Object concreto; MinioStickerStore lo adapta a io.ReadCloser.
type stickerObjectReader interface {
	GetObject(ctx context.Context, bucketName, objectName string, opts minio.GetObjectOptions) (io.ReadCloser, error)
}

// MinioStickerStore adapta *minio.Client a StickerObjectStore + lectura de
// bytes. Embebe el cliente (StatObject/PutObject se promueven tal cual) y
// redefine GetObject para devolver io.ReadCloser.
type MinioStickerStore struct {
	*minio.Client
}

// GetObject devuelve el objeto como io.ReadCloser.
func (s MinioStickerStore) GetObject(ctx context.Context, bucketName, objectName string, opts minio.GetObjectOptions) (io.ReadCloser, error) {
	return s.Client.GetObject(ctx, bucketName, objectName, opts)
}

// stickerObjectGetter devuelve el lector de objetos del store, o nil si el
// store inyectado no sabe leer (los dobles de test que no lo necesitan).
func stickerObjectGetter(store StickerObjectStore) stickerObjectReader {
	reader, _ := store.(stickerObjectReader)
	return reader
}

// StickerLibraryServicer define la biblioteca persistente de stickers del
// usuario autenticado.
type StickerLibraryServicer interface {
	// UploadSticker valida y almacena el archivo (delegando en el servicio de
	// SF1) y persiste la fila propia. Devuelve created=false si el usuario ya
	// tenía ese mismo contenido (dedupe por sha256).
	UploadSticker(telephon, tags string, file multipart.File, header *multipart.FileHeader, ctx context.Context) (models.StickerResponse, bool, error)
	// SaveSticker añade a "Mis stickers" una URL de sticker ya almacenada,
	// referenciando el mismo objeto (sin copia). created=false si ya estaba.
	SaveSticker(telephon, url string, ctx context.Context) (models.StickerResponse, bool, error)
	// ListStickers devuelve {mine, favorites, recents} con los topes de cada lista.
	ListStickers(telephon string, ctx context.Context) (models.StickerLibraryResponse, error)
	// SetFavorite marca o desmarca un favorito (integrado o propio).
	SetFavorite(telephon, url string, favorite bool, ctx context.Context) error
	// DeleteSticker borra (soft) un sticker propio. models.ErrStickerNotFound si
	// no es del usuario.
	DeleteSticker(telephon string, id uint, ctx context.Context) error
}

// ServiceStickerLibrary orquesta el alta/baja y la biblioteca de stickers.
// Reutiliza el servicio de SF1 para la validación de bytes y el almacenamiento.
type ServiceStickerLibrary struct {
	upload *ServiceSticker
	store  StickerObjectStore
	repo   StickerRepoInterface
}

// InitServiceStickerLibrary construye el servicio devolviendo la interfaz. El
// cliente MinIO se envuelve para poder leer los bytes de un objeto (RF1); un
// store que ya sepa leer (los dobles de test) se usa tal cual.
func InitServiceStickerLibrary(store StickerObjectStore, repo StickerRepoInterface) StickerLibraryServicer {
	if client, ok := store.(*minio.Client); ok {
		store = MinioStickerStore{Client: client}
	}
	return NewServiceStickerLibrary(store, repo)
}

// NewServiceStickerLibrary crea el servicio concreto.
func NewServiceStickerLibrary(store StickerObjectStore, repo StickerRepoInterface) *ServiceStickerLibrary {
	return &ServiceStickerLibrary{upload: NewServiceSticker(store), store: store, repo: repo}
}

// ownerID resuelve el id del usuario autenticado. El dueño sale siempre del
// contexto de auth (teléfono), nunca del request.
func (s *ServiceStickerLibrary) ownerID(telephon string, ctx context.Context) (uint, error) {
	id, err := s.repo.GetIdByTelephon(telephon, ctx)
	if err != nil {
		return 0, err
	}
	if id <= 0 {
		return 0, models.ErrUserNotFound
	}
	return uint(id), nil
}

// persist crea la fila propia de forma idempotente. Los duplicados se devuelven
// antes de comprobar el tope, de modo que re-subir un sticker existente no
// falla aunque el usuario esté en el máximo.
func (s *ServiceStickerLibrary) persist(ownerID uint, sha, url string, animated bool, tags []string, ctx context.Context) (models.StickerResponse, bool, error) {
	existing, err := s.repo.GetStickerBySHA(ownerID, sha, ctx)
	if err == nil {
		return toStickerResponse(*existing), false, nil
	}
	if !errors.Is(err, models.ErrStickerNotFound) {
		return models.StickerResponse{}, false, err
	}

	n, err := s.repo.CountStickers(ownerID, ctx)
	if err != nil {
		return models.StickerResponse{}, false, err
	}
	if n >= models.MaxUserStickers {
		return models.StickerResponse{}, false, ErrStickerLimit
	}

	row, created, err := s.repo.CreateSticker(&models.UserSticker{
		IdUser:   ownerID,
		SHA256:   sha,
		URL:      url,
		Animated: animated,
		Tags:     strings.Join(tags, ","),
	}, ctx)
	if err != nil {
		return models.StickerResponse{}, false, err
	}
	return toStickerResponse(row), created, nil
}

func (s *ServiceStickerLibrary) UploadSticker(telephon, tags string, file multipart.File, header *multipart.FileHeader, ctx context.Context) (models.StickerResponse, bool, error) {
	ownerID, err := s.ownerID(telephon, ctx)
	if err != nil {
		return models.StickerResponse{}, false, err
	}
	res, err := s.upload.UploadSticker(file, header, ctx)
	if err != nil {
		if utils.IsInternalError(err) {
			return models.StickerResponse{}, false, err
		}
		// Error de validación de SF1 (formato, dimensiones, tamaño): 400.
		return models.StickerResponse{}, false, fmt.Errorf("%w: %w", ErrStickerInvalid, err)
	}
	return s.persist(ownerID, res.SHA256, res.URL, res.Animated, normalizeStickerTags(tags), ctx)
}

func (s *ServiceStickerLibrary) SaveSticker(telephon, url string, ctx context.Context) (models.StickerResponse, bool, error) {
	ownerID, err := s.ownerID(telephon, ctx)
	if err != nil {
		return models.StickerResponse{}, false, err
	}
	if utils.IsBuiltinStickerURL(url) {
		return models.StickerResponse{}, false, ErrStickerBuiltinFavorite
	}
	key, sha, ok := s.stickerKeyFromURL(url)
	if !ok {
		return models.StickerResponse{}, false, ErrStickerSaveURLInvalid
	}
	// Solo se referencia el objeto si existe: no se copia ni se sube nada.
	if _, err := s.store.StatObject(ctx, s.upload.bucket, key, minio.StatObjectOptions{}); err != nil {
		if minio.ToErrorResponse(err).Code == "NoSuchKey" {
			return models.StickerResponse{}, false, models.ErrStickerNotFound
		}
		return models.StickerResponse{}, false, fmt.Errorf("error verificando el sticker en almacenamiento: %w", err)
	}
	// RF1: el flag animated se deriva de los bytes reales del objeto; un fallo de
	// lectura no impide guardar (se registra y queda como no animado).
	return s.persist(ownerID, sha, url, s.animatedFromObject(ctx, key), nil, ctx)
}

// animatedFromObject lee el objeto y reutiliza la cabecera de SF1 para decidir
// si es un WebP animado. Devuelve false si el store no sabe leer o si falla la
// lectura/sniff (best-effort: no debe romper el guardado).
func (s *ServiceStickerLibrary) animatedFromObject(ctx context.Context, key string) bool {
	reader := stickerObjectGetter(s.store)
	if reader == nil {
		return false
	}
	obj, err := reader.GetObject(ctx, s.upload.bucket, key, minio.GetObjectOptions{})
	if err != nil {
		slog.Warn("sticker: no se pudo leer el objeto para detectar animación", "key", key, "err", err)
		return false
	}
	defer obj.Close()
	data, err := io.ReadAll(io.LimitReader(obj, stickerAnimatedMaxBytes+1))
	if err != nil {
		slog.Warn("sticker: no se pudo leer el contenido para detectar animación", "key", key, "err", err)
		return false
	}
	info, err := stickerHeader(data)
	if err != nil {
		slog.Warn("sticker: cabecera inválida al detectar animación", "key", key, "err", err)
		return false
	}
	return info.animated
}

func (s *ServiceStickerLibrary) ListStickers(telephon string, ctx context.Context) (models.StickerLibraryResponse, error) {
	ownerID, err := s.ownerID(telephon, ctx)
	if err != nil {
		return models.StickerLibraryResponse{}, err
	}
	mine, err := s.repo.ListStickers(ownerID, models.MaxUserStickers, ctx)
	if err != nil {
		return models.StickerLibraryResponse{}, err
	}
	favs, err := s.repo.ListFavorites(ownerID, models.MaxStickerFavorites, ctx)
	if err != nil {
		return models.StickerLibraryResponse{}, err
	}
	recents, err := s.repo.ListRecents(ownerID, models.StickerRecentsMax, ctx)
	if err != nil {
		return models.StickerLibraryResponse{}, err
	}
	return models.StickerLibraryResponse{
		Mine:      toStickerResponses(mine),
		Favorites: toFavoriteItems(favs),
		Recents:   toRecentItems(recents),
	}, nil
}

func (s *ServiceStickerLibrary) SetFavorite(telephon, url string, favorite bool, ctx context.Context) error {
	ownerID, err := s.ownerID(telephon, ctx)
	if err != nil {
		return err
	}
	custom, err := s.repo.GetStickerByURL(ownerID, url, ctx)
	isCustom := err == nil
	if err != nil && !errors.Is(err, models.ErrStickerNotFound) {
		return err
	}
	if !isCustom && !utils.IsBuiltinStickerURL(url) {
		return ErrStickerFavoriteInvalid
	}

	if favorite {
		if err := s.repo.UpsertFavorite(&models.StickerFavorite{IdUser: ownerID, URL: url}, ctx); err != nil {
			return err
		}
	} else if err := s.repo.DeleteFavorite(ownerID, url, ctx); err != nil {
		return err
	}

	// En un sticker propio la marca favorite vive también en su fila, para que
	// GET /stickers la devuelva dentro de "mine".
	if isCustom {
		return s.repo.SetStickerFavorite(ownerID, custom.ID, favorite, ctx)
	}
	return nil
}

func (s *ServiceStickerLibrary) DeleteSticker(telephon string, id uint, ctx context.Context) error {
	ownerID, err := s.ownerID(telephon, ctx)
	if err != nil {
		return err
	}
	sticker, err := s.repo.GetStickerByID(ownerID, id, ctx)
	if err != nil {
		return err
	}
	found, err := s.repo.SoftDeleteSticker(ownerID, id, ctx)
	if err != nil {
		return err
	}
	if !found {
		return models.ErrStickerNotFound
	}
	// RF6: un sticker borrado no debe seguir en favoritos (su URL deja de ser
	// válida como favorito propio).
	if err := s.repo.DeleteFavorite(ownerID, sticker.URL, ctx); err != nil {
		slog.Warn("sticker: no se pudo quitar el favorito al borrar", "url", sticker.URL, "err", err)
	}
	s.maybeEnqueueStickerGC(ctx, sticker.URL)
	return nil
}

// maybeEnqueueStickerGC encola el objeto de un sticker borrado cuando ya nada
// lo referencia (mensajes vivos, favoritos o recientes lo protegen). Un fallo
// del GC no debe romper el borrado del usuario: se registra y se sigue.
func (s *ServiceStickerLibrary) maybeEnqueueStickerGC(ctx context.Context, url string) {
	key, _, ok := s.stickerKeyFromURL(url)
	if !ok {
		return
	}
	referenced, err := s.repo.MediaKeyReferenced(ctx, key)
	if err != nil {
		slog.Warn("sticker: no se pudo comprobar si el objeto sigue referenciado", "key", key, "err", err)
		return
	}
	if referenced {
		return
	}
	if err := s.repo.EnqueueMediaGC(ctx, key); err != nil {
		slog.Warn("sticker: no se pudo encolar el objeto para GC", "key", key, "err", err)
	}
}

// stickerKeyFromURL deriva la clave de objeto de una URL de sticker subido,
// aceptando solo la forma relativa de nuestro bucket o la base pública
// configurada. Devuelve también el sha256 del nombre del objeto.
func (s *ServiceStickerLibrary) stickerKeyFromURL(raw string) (key, sha string, ok bool) {
	var tail string
	switch {
	case utils.IsStickerStorageURL(raw):
		prefix := "/storage/" + s.upload.bucket + "/"
		if !strings.HasPrefix(raw, prefix) {
			return "", "", false
		}
		tail = strings.TrimPrefix(raw, prefix)
	case isPublicBaseStickerURL(raw):
		tail = strings.TrimPrefix(raw, s.upload.baseURL+"/")
	default:
		return "", "", false
	}
	if !utils.IsStickerStorageSuffix(tail) {
		return "", "", false
	}
	name := strings.TrimPrefix(tail, stickerPrefix)
	// El sufijo ya garantiza "<64 hex>.<webp|png>", pero la extracción se
	// guarda explícitamente: nunca un sha vacío ni un índice -1 (pánico).
	dot := strings.LastIndex(name, ".")
	if dot <= 0 || dot == len(name)-1 {
		return "", "", false
	}
	sha = name[:dot]
	if sha == "" {
		return "", "", false
	}
	return tail, sha, true
}

// normalizeStickerTags limpia un CSV de etiquetas: minúsculas, sin vacíos ni
// duplicados, cada una de hasta StickerTagMaxLen caracteres y como máximo
// StickerTagsMax.
func normalizeStickerTags(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	seen := make(map[string]bool)
	out := make([]string, 0, models.StickerTagsMax)
	for _, part := range strings.Split(raw, ",") {
		tag := strings.ToLower(strings.TrimSpace(part))
		if tag == "" || seen[tag] {
			continue
		}
		if utf8.RuneCountInString(tag) > models.StickerTagMaxLen {
			tag = string([]rune(tag)[:models.StickerTagMaxLen])
		}
		seen[tag] = true
		out = append(out, tag)
		if len(out) == models.StickerTagsMax {
			break
		}
	}
	return out
}

// splitStickerTags deshace normalizeStickerTags para la respuesta.
func splitStickerTags(raw string) []string {
	out := make([]string, 0)
	for _, part := range strings.Split(raw, ",") {
		if tag := strings.TrimSpace(part); tag != "" {
			out = append(out, tag)
		}
	}
	return out
}

func toStickerResponse(s models.UserSticker) models.StickerResponse {
	return models.StickerResponse{
		ID:        s.ID,
		URL:       s.URL,
		SHA256:    s.SHA256,
		Animated:  s.Animated,
		Favorite:  s.Favorite,
		Tags:      splitStickerTags(s.Tags),
		CreatedAt: s.CreatedAt,
	}
}

func toStickerResponses(rows []models.UserSticker) []models.StickerResponse {
	out := make([]models.StickerResponse, 0, len(rows))
	for _, s := range rows {
		out = append(out, toStickerResponse(s))
	}
	return out
}

func toFavoriteItems(rows []models.StickerFavorite) []models.StickerFavoriteItem {
	out := make([]models.StickerFavoriteItem, 0, len(rows))
	for _, f := range rows {
		out = append(out, models.StickerFavoriteItem{URL: f.URL, CreatedAt: f.CreatedAt})
	}
	return out
}

func toRecentItems(rows []models.StickerRecent) []models.StickerRecentItem {
	out := make([]models.StickerRecentItem, 0, len(rows))
	for _, r := range rows {
		out = append(out, models.StickerRecentItem{URL: r.URL, LastUsedAt: r.LastUsedAt})
	}
	return out
}
