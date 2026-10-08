package repos

import (
	"context"
	"fmt"
	"time"
	"unicode/utf8"

	"gorm/backend/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// RepoExpiry agrupa el acceso a datos del job de expiración de mensajes
// temporales y de la cola de borrado de objetos de MinIO (media_gc).
//
// Todo borrado es FÍSICO e irreversible, así que cada pasada borra solo por la
// lista explícita de ids que seleccionó (y bloqueó) en la misma transacción.
// La comparación de tiempo usa siempre now() de la BD, nunca la hora de Go.
type RepoExpiry struct {
	data *gorm.DB
}

// InitRepoExpiry crea el repositorio del job de expiración.
func InitRepoExpiry(data *gorm.DB) *RepoExpiry {
	return &RepoExpiry{data: data}
}

const (
	expiryTimeout = 30 * time.Second
	// mediaGCLastErrorMax es el tamaño de la columna media_gc.last_error.
	mediaGCLastErrorMax = 500
)

// expiredRow es una fila seleccionada para expirar (1:1 o grupo).
type expiredRow struct {
	ID         uint   `gorm:"column:id"`
	IdUser     uint   `gorm:"column:id_user"`
	IdReceptor uint   `gorm:"column:id_receptor"`
	GroupID    uint   `gorm:"column:group_id"`
	MediaUrl   string `gorm:"column:media_url"`
}

// expiryTarget resuelve el modelo y las columnas de participantes de un kind
// ("direct" -> messages, "group" -> group_messages). Un kind desconocido es un
// error: nunca se construye SQL de borrado sobre una tabla adivinada.
func expiryTarget(kind string) (model interface{}, columns string, err error) {
	switch kind {
	case models.ReactionKindDirect:
		return &models.Message{}, "id, id_user, id_receptor, media_url", nil
	case models.ReactionKindGroup:
		return &models.GroupMessage{}, "id, group_id, media_url", nil
	}
	return nil, "", fmt.Errorf("tipo de mensaje desconocido para expirar: %q", kind)
}

// selectExpired devuelve hasta limit mensajes vencidos (expires_at <= now()),
// incluidos los borrados para todos (Unscoped: conservan el texto). Con lock
// las filas quedan bloqueadas (FOR UPDATE SKIP LOCKED) hasta el fin de la
// transacción, así dos pasadas concurrentes nunca procesan la misma fila.
func selectExpired(tx *gorm.DB, kind string, limit int, lock bool) ([]expiredRow, error) {
	model, columns, err := expiryTarget(kind)
	if err != nil {
		return nil, err
	}
	q := tx.Unscoped().Model(model).Select(columns).
		Where("expires_at <= now()").
		Order("id").
		Limit(limit)
	if lock {
		q = q.Clauses(clause.Locking{Strength: "UPDATE", Options: "SKIP LOCKED"})
	}
	var rows []expiredRow
	if err := q.Find(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

// scrubReplies borra la cita copiada (texto, autor e id) de las respuestas a
// los mensajes que expiran: la respuesta guarda una copia del texto original
// y sin esto el contenido vencido sobreviviría en ella. El cliente solo pinta
// la cita cuando ReplyToMessage no está vacío, así que la respuesta queda como
// un mensaje normal sin cita (sin id colgante).
func scrubReplies(tx *gorm.DB, kind string, ids []uint) error {
	model, _, err := expiryTarget(kind)
	if err != nil {
		return err
	}
	if len(ids) == 0 {
		return nil
	}
	return tx.Unscoped().Model(model).
		Where("reply_to_message_id IN ?", ids).
		UpdateColumns(map[string]interface{}{
			"reply_to_message_id": nil,
			"reply_to_message":    nil,
			"reply_to_telephon":   nil,
		}).Error
}

// orphanReplyWindow acota el barrido de respuestas huérfanas a las filas
// creadas hace poco: una respuesta que perdió la carrera con la expiración se
// acaba de crear. Es una constante interna, nunca entrada de usuario.
const orphanReplyWindow = "15 minutes"

// sweepOrphanReplies limpia la cita (id, texto y autor) de las respuestas
// recientes cuyo objetivo ya no existe como fila. Cubre la carrera en que una
// respuesta leyó el objetivo antes de la transacción de expiración y confirmó
// después: scrubReplies no la vio. Los objetivos soft-deleted siguen existiendo
// (la subconsulta no filtra deleted_at) y por eso no cuentan como huérfanos;
// solo los borrados físicamente lo son.
func sweepOrphanReplies(tx *gorm.DB, kind string) error {
	model, _, err := expiryTarget(kind)
	if err != nil {
		return err
	}
	table := "messages"
	if kind == models.ReactionKindGroup {
		table = "group_messages"
	}
	return tx.Unscoped().Model(model).
		Where("reply_to_message_id IS NOT NULL AND created_at > now() - interval '" + orphanReplyWindow + "' AND " +
			"NOT EXISTS (SELECT 1 FROM " + table + " t WHERE t.id = " + table + ".reply_to_message_id)").
		UpdateColumns(map[string]interface{}{
			"reply_to_message_id": nil,
			"reply_to_message":    nil,
			"reply_to_telephon":   nil,
		}).Error
}

// SweepOrphanReplies ejecuta sweepOrphanReplies para el kind.
func (r *RepoExpiry) SweepOrphanReplies(ctx context.Context, kind string) error {
	c, cancel := context.WithTimeout(ctx, expiryTimeout)
	defer cancel()
	return sweepOrphanReplies(r.data.WithContext(c), kind)
}

// deleteExpiredReactions borra las reacciones de los mensajes que expiran
// (message_reactions no tiene FK; la clave es (message_kind, message_id)).
func deleteExpiredReactions(tx *gorm.DB, kind string, ids []uint) error {
	if _, _, err := expiryTarget(kind); err != nil {
		return err
	}
	if len(ids) == 0 {
		return nil
	}
	return tx.Where("message_kind = ? AND message_id IN ?", kind, ids).
		Delete(&models.MessageReaction{}).Error
}

// hardDeleteMessages borra físicamente (Unscoped) los mensajes de la lista
// explícita de ids. Nunca borra por predicado.
func hardDeleteMessages(tx *gorm.DB, kind string, ids []uint) error {
	model, _, err := expiryTarget(kind)
	if err != nil {
		return err
	}
	if len(ids) == 0 {
		return nil
	}
	return tx.Unscoped().Where("id IN ?", ids).Delete(model).Error
}

// enqueueMediaGC encola los object keys para que el job los borre de MinIO
// (tras volver a comprobar que nada los referencia). Idempotente: si la key ya
// está en la cola se conserva su fila (y su backoff).
func enqueueMediaGC(tx *gorm.DB, keys []string) error {
	seen := make(map[string]bool, len(keys))
	for _, key := range keys {
		if key == "" || seen[key] {
			continue
		}
		seen[key] = true
		if err := tx.Exec(`INSERT INTO media_gc (object_key, attempts, next_attempt_at, last_error, created_at, updated_at)
			VALUES (?, 0, now(), '', now(), now()) ON CONFLICT (object_key) DO NOTHING`, key).Error; err != nil {
			return err
		}
	}
	return nil
}

// expiredMediaKeys deriva los object keys (sin repetir) de los adjuntos de las
// filas. Las URLs que no son de nuestro almacenamiento no se encolan.
func expiredMediaKeys(rows []expiredRow, keyOf func(string) (string, bool)) []string {
	if keyOf == nil {
		return nil
	}
	var keys []string
	seen := map[string]bool{}
	for _, r := range rows {
		if r.MediaUrl == "" {
			continue
		}
		key, ok := keyOf(r.MediaUrl)
		if !ok || seen[key] {
			continue
		}
		seen[key] = true
		keys = append(keys, key)
	}
	return keys
}

// ExpireBatch expira un lote (hasta limit) de mensajes vencidos del kind en una
// única transacción: selecciona y bloquea, limpia las citas de las respuestas,
// borra sus reacciones, encola sus adjuntos en media_gc y los borra físicamente
// por id. Devuelve los mensajes borrados con sus participantes para notificar.
func (r *RepoExpiry) ExpireBatch(ctx context.Context, kind string, limit int, keyOf func(string) (string, bool)) ([]models.ExpiredMessage, error) {
	c, cancel := context.WithTimeout(ctx, expiryTimeout)
	defer cancel()

	var out []models.ExpiredMessage
	err := r.data.WithContext(c).Transaction(func(tx *gorm.DB) error {
		rows, err := selectExpired(tx, kind, limit, true)
		if err != nil || len(rows) == 0 {
			return err
		}
		ids := make([]uint, len(rows))
		for i, row := range rows {
			ids[i] = row.ID
		}
		if err := scrubReplies(tx, kind, ids); err != nil {
			return err
		}
		if err := deleteExpiredReactions(tx, kind, ids); err != nil {
			return err
		}
		if err := enqueueMediaGC(tx, expiredMediaKeys(rows, keyOf)); err != nil {
			return err
		}
		if err := hardDeleteMessages(tx, kind, ids); err != nil {
			return err
		}
		telephons, err := userTelephons(tx, rows)
		if err != nil {
			return err
		}
		out = make([]models.ExpiredMessage, len(rows))
		for i, row := range rows {
			out[i] = models.ExpiredMessage{
				ID:               row.ID,
				SenderID:         row.IdUser,
				ReceptorID:       row.IdReceptor,
				SenderTelephon:   telephons[row.IdUser],
				ReceptorTelephon: telephons[row.IdReceptor],
				GroupID:          row.GroupID,
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// userTelephons resuelve los teléfonos de los participantes 1:1 de las filas
// (los grupos se notifican por room y no los necesitan).
func userTelephons(tx *gorm.DB, rows []expiredRow) (map[uint]string, error) {
	seen := map[uint]bool{}
	var ids []uint
	for _, r := range rows {
		for _, id := range []uint{r.IdUser, r.IdReceptor} {
			if id != 0 && !seen[id] {
				seen[id] = true
				ids = append(ids, id)
			}
		}
	}
	out := make(map[uint]string, len(ids))
	if len(ids) == 0 {
		return out, nil
	}
	var users []struct {
		ID       uint
		Telephon string
	}
	if err := tx.Unscoped().Model(&models.UserDataBase{}).Select("id, telephon").
		Where("id IN ?", ids).Scan(&users).Error; err != nil {
		return nil, err
	}
	for _, u := range users {
		out[u.ID] = u.Telephon
	}
	return out, nil
}

// CountExpired cuenta los mensajes vencidos del kind sin tocarlos (dry-run).
func (r *RepoExpiry) CountExpired(ctx context.Context, kind string) (int64, error) {
	model, _, err := expiryTarget(kind)
	if err != nil {
		return 0, err
	}
	c, cancel := context.WithTimeout(ctx, expiryTimeout)
	defer cancel()
	var n int64
	err = r.data.WithContext(c).Unscoped().Model(model).Where("expires_at <= now()").Count(&n).Error
	return n, err
}

// DueMediaGC devuelve hasta limit filas de la cola cuyo reintento ya toca.
func (r *RepoExpiry) DueMediaGC(ctx context.Context, limit int) ([]models.MediaGC, error) {
	c, cancel := context.WithTimeout(ctx, expiryTimeout)
	defer cancel()
	var rows []models.MediaGC
	err := r.data.WithContext(c).Where("next_attempt_at <= now()").Order("id").Limit(limit).Find(&rows).Error
	return rows, err
}

// mediaReferencedSQL comprueba si alguna fila VIVA (deleted_at IS NULL) sigue
// apuntando al objeto: adjuntos de mensajes 1:1 y de grupo, estados, avatar y
// fondo de usuario, fondo por contacto, avatar de grupo y la biblioteca de
// stickers (propios, favoritos y recientes). Las URLs terminan en "/" + key y
// las keys llevan un xid/sha único, así que basta el sufijo exacto (sin LIKE:
// nada de comodines que escapar).
const mediaReferencedSQL = `SELECT
	EXISTS (SELECT 1 FROM messages WHERE deleted_at IS NULL AND right(media_url, @n) = @suffix)
	OR EXISTS (SELECT 1 FROM group_messages WHERE deleted_at IS NULL AND right(media_url, @n) = @suffix)
	OR EXISTS (SELECT 1 FROM statuses WHERE deleted_at IS NULL AND right(media_url, @n) = @suffix)
	OR EXISTS (SELECT 1 FROM user_data_bases WHERE deleted_at IS NULL AND (right(avatar_url, @n) = @suffix OR right(wallpaper_url, @n) = @suffix))
	OR EXISTS (SELECT 1 FROM contact_data_bases WHERE deleted_at IS NULL AND right(wallpaper_url, @n) = @suffix)
	OR EXISTS (SELECT 1 FROM groups WHERE deleted_at IS NULL AND right(avatar_url, @n) = @suffix)
	OR EXISTS (SELECT 1 FROM user_stickers WHERE deleted_at IS NULL AND right(url, @n) = @suffix)
	OR EXISTS (SELECT 1 FROM sticker_favorites WHERE right(url, @n) = @suffix)
	OR EXISTS (SELECT 1 FROM sticker_recents WHERE right(url, @n) = @suffix)`

// MediaKeyReferenced indica si el objeto sigue referenciado por alguna fila viva.
func (r *RepoExpiry) MediaKeyReferenced(ctx context.Context, key string) (bool, error) {
	c, cancel := context.WithTimeout(ctx, expiryTimeout)
	defer cancel()
	suffix := "/" + key
	var referenced bool
	err := r.data.WithContext(c).Raw(mediaReferencedSQL, map[string]interface{}{
		"n":      utf8.RuneCountInString(suffix),
		"suffix": suffix,
	}).Scan(&referenced).Error
	return referenced, err
}

// EnqueueMediaGC encola un object key en la cola media_gc para que el job lo
// borre de MinIO tras volver a comprobar que nada lo referencia. Es idempotente
// (ON CONFLICT DO NOTHING). Lo usa la biblioteca de stickers al borrar la última
// referencia a un objeto; una key vacía no encola nada.
func (r *RepoExpiry) EnqueueMediaGC(ctx context.Context, key string) error {
	if key == "" {
		return nil
	}
	c, cancel := context.WithTimeout(ctx, expiryTimeout)
	defer cancel()
	return enqueueMediaGC(r.data.WithContext(c), []string{key})
}

// DeleteMediaGC saca una fila de la cola (borrado hecho, abandonado u omitido).
func (r *RepoExpiry) DeleteMediaGC(ctx context.Context, id uint) error {
	c, cancel := context.WithTimeout(ctx, expiryTimeout)
	defer cancel()
	return r.data.WithContext(c).Where("id = ?", id).Delete(&models.MediaGC{}).Error
}

// RescheduleMediaGC registra un intento fallido y programa el siguiente a
// backoff desde ahora. El instante se calcula en SQL (now() de la BD) porque
// DueMediaGC compara con el mismo reloj: nunca se mezcla con la hora de Go.
func (r *RepoExpiry) RescheduleMediaGC(ctx context.Context, id uint, attempts int, backoff time.Duration, lastErr string) error {
	c, cancel := context.WithTimeout(ctx, expiryTimeout)
	defer cancel()
	return r.data.WithContext(c).Model(&models.MediaGC{}).Where("id = ?", id).
		UpdateColumns(map[string]interface{}{
			"attempts":        attempts,
			"next_attempt_at": gorm.Expr("now() + make_interval(secs => ?)", backoff.Seconds()),
			"last_error":      truncateRunes(lastErr, mediaGCLastErrorMax),
			"updated_at":      gorm.Expr("now()"),
		}).Error
}

// CountMediaGC devuelve cuántos objetos siguen pendientes en la cola.
func (r *RepoExpiry) CountMediaGC(ctx context.Context) (int64, error) {
	c, cancel := context.WithTimeout(ctx, expiryTimeout)
	defer cancel()
	var n int64
	err := r.data.WithContext(c).Model(&models.MediaGC{}).Count(&n).Error
	return n, err
}

// truncateRunes recorta s a max caracteres sin partir un carácter UTF-8.
func truncateRunes(s string, max int) string {
	if utf8.RuneCountInString(s) <= max {
		return s
	}
	return string([]rune(s)[:max])
}
