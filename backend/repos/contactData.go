package repos

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"gorm/backend/models"
	"gorm/backend/schemas"
	"log"
	"strconv"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

type ApiContact struct {
	data *gorm.DB
	rd   *redis.Client
}

// InitRepoContact crea el repositorio de contactos y mensajes con la conexión GORM y Redis.
func InitRepoContact(data *gorm.DB, rd *redis.Client) *ApiContact {
	return &ApiContact{
		data: data,
		rd:   rd,
	}
}

// GetUserDataBase obtiene los datos de perfil de un usuario buscando por username.
func (ap *ApiContact) GetUserDataBase(username string, ctx context.Context) (*schemas.UserGet, error) {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	var user schemas.UserGet
	result := ap.data.WithContext(c).
		Table("user_data_bases").
		Where("username = ? AND deleted_at IS NULL", strings.TrimSpace(username)).
		Select("username", "telephon", "gmail", "avatar_url", "wallpaper_url").
		Scan(&user)
	if result.Error != nil {
		return nil, result.Error
	}
	if result.RowsAffected == 0 {
		return nil, errors.New("usuario no encontrado")
	}
	return &user, nil
}

// RepoPutUser actualiza el username de un usuario buscándolo por su username actual.
func (ap *ApiContact) RepoPutUser(username string, usernameUpdate string, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	result := ap.data.Model(&models.UserDataBase{}).WithContext(c).Where("username = ?", username).Update("username", usernameUpdate)
	if result.Error != nil || result.RowsAffected == 0 {
		return errors.New("Error al modificar username")
	}
	return nil
}

// GetUserDataBaseByTelephon obtiene los datos de un usuario buscando por número de teléfono
func (ap *ApiContact) GetUserDataBaseByTelephon(telephon string, ctx context.Context) (*schemas.UserGet, error) {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	var user schemas.UserGet
	result := ap.data.WithContext(c).
		Table("user_data_bases").
		Where("telephon = ? AND deleted_at IS NULL", strings.TrimSpace(telephon)).
		Select("username", "telephon", "gmail", "avatar_url", "wallpaper_url").
		Scan(&user)
	if result.Error != nil {
		return nil, result.Error
	}
	if result.RowsAffected == 0 {
		return nil, errors.New("usuario no encontrado")
	}
	return &user, nil
}

// RepoPutUserByTelephon actualiza el username de un usuario buscándolo por su telephon
func (ap *ApiContact) RepoPutUserByTelephon(telephon string, usernameUpdate string, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	result := ap.data.Model(&models.UserDataBase{}).WithContext(c).Where("telephon = ?", telephon).Update("username", usernameUpdate)
	if result.Error != nil || result.RowsAffected == 0 {
		return errors.New("Error al modificar username")
	}
	return nil
}

// UpdateAvatarByTelephon actualiza la URL del avatar de un usuario buscándolo por su telephon
func (ap *ApiContact) UpdateAvatarByTelephon(telephon string, avatarUrl string, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	result := ap.data.Model(&models.UserDataBase{}).WithContext(c).
		Where("telephon = ?", telephon).
		Update("avatar_url", avatarUrl)
	if result.Error != nil || result.RowsAffected == 0 {
		return errors.New("error al actualizar avatar")
	}
	return nil
}

// AddContact persiste una nueva relación de contacto en la BD e invalida la
// caché de contactos (presencia online/offline) de ambos usuarios.
func (ap *ApiContact) AddContact(contact models.ContactDataBase, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err := ap.data.Model(&models.ContactDataBase{}).WithContext(c).Create(&contact).Error; err != nil {
		return err
	}
	ap.invalidateContactsCache(c, contact.IdUser, contact.IdContact)
	return nil
}

// invalidateContactsCache borra la lista cacheada de contactos de los usuarios
// indicados para que las notificaciones de presencia incluyan los cambios.
func (ap *ApiContact) invalidateContactsCache(ctx context.Context, userIDs ...uint) {
	if ap.rd == nil || len(userIDs) == 0 {
		return
	}
	var telephons []string
	if err := ap.data.WithContext(ctx).Model(&models.UserDataBase{}).
		Where("id IN ?", userIDs).
		Pluck("telephon", &telephons).Error; err != nil {
		log.Printf("[REPO] Error invalidando caché de contactos: %v", err)
		return
	}
	keys := make([]string, 0, len(telephons))
	for _, t := range telephons {
		keys = append(keys, fmt.Sprintf("user:contacts:%s", t))
	}
	if len(keys) > 0 {
		ap.rd.Del(ctx, keys...)
	}
}

// ExistContactAdd verifica si ya existe la relación de contacto entre dos usuarios.
func (ap *ApiContact) ExistContactAdd(idUser uint, IdContact uint, ctx context.Context) (bool, error) {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	var count int64
	result := ap.data.Model(&models.ContactDataBase{}).WithContext(c).Where("id_user = ?", idUser).Where("id_contact = ?", IdContact).Count(&count)
	if result.Error != nil {
		return false, result.Error
	}
	return count > 0, nil
}

// IsAcceptedContact verifica si el usuario con userID tiene al usuario con contactID
// como contacto con status = 'accepted'. Usado para validar si se puede añadir
// a alguien como miembro de un grupo.
func (ap *ApiContact) IsAcceptedContact(userID, contactID uint, ctx context.Context) (bool, error) {
	c, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	var count int64
	result := ap.data.Model(&models.ContactDataBase{}).WithContext(c).
		Where("id_user = ? AND id_contact = ? AND status = 'accepted'", userID, contactID).
		Count(&count)
	if result.Error != nil {
		return false, result.Error
	}
	return count > 0, nil
}

// GetIdUsername obtiene el ID interno del usuario por su username.
func (app *ApiContact) GetIdUsername(username string, ctx context.Context) (int, error) {
	c, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	var id_user int
	result := app.data.Model(&models.UserDataBase{}).WithContext(c).Select("id").Where("username = ?", username).Scan(&id_user)
	if result.Error != nil || id_user == 0 {
		return -1, errors.New("id usuario no encontrado")
	}
	return id_user, nil
}

// GetNumberUsername obtiene el ID interno del usuario por su número de teléfono.
func (app *ApiContact) GetNumberUsername(username string, ctx context.Context) (int, error) {
	c, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	var id_user int
	result := app.data.Model(&models.UserDataBase{}).WithContext(c).Select("id").Where("telephon = ?", username).Scan(&id_user)
	if result.Error != nil || id_user == 0 {
		return -1, errors.New("numero inexistente")
	}
	return id_user, nil
}

// GetContactNumber obtiene los datos básicos de un usuario (username, telephon) por su número.
func (app *ApiContact) GetContactNumber(number string, ctx context.Context) (*models.ContactChat, error) {
	c, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	var contact models.ContactChat
	result := app.data.Model(&models.UserDataBase{}).WithContext(c).
		Select("username AS username, telephon AS number").
		Where("telephon = ?", number).
		Scan(&contact)
	if result.Error != nil {
		return nil, result.Error
	}
	// No establecer status aquí, se debe obtener de la relación de contacto
	return &contact, nil
}

// GetContactsNumber obtiene la lista completa de contactos del usuario incluyendo
// username, número, estado, nombre de contacto, última conexión y avatar.
func (app *ApiContact) GetContactsNumber(id uint, ctx context.Context) (*[]models.ContactChat, error) {
	c, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	var contacts []models.ContactChat
	result := app.data.WithContext(c).Table("user_data_bases").
		Select(`
			user_data_bases.username AS username,
			user_data_bases.telephon AS number,
			contact_data_bases.status AS status,
			contact_data_bases.contact_name AS contact_name,
			user_data_bases.last_seen AS last_seen,
			user_data_bases.avatar_url AS avatar_url,
			contact_data_bases.wallpaper_url AS wallpaper_url
		`).
		Joins("INNER JOIN contact_data_bases ON user_data_bases.id = contact_data_bases.id_contact").
		Where("contact_data_bases.id_user = ?", id).
		Where("contact_data_bases.status != ?", "rejected").
		Order("contact_data_bases.created_at DESC").
		Scan(&contacts)
	return &contacts, result.Error
}

// CreateMessage persiste un nuevo mensaje en la BD.
func (app *ApiContact) CreateMessage(message *models.Message, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	return app.data.Model(&models.Message{}).WithContext(c).Create(message).Error
}

// GetMessages obtiene los mensajes entre dos usuarios excluyendo los borrados por cada parte.
// Devuelve los últimos 200 mensajes de la conversación (primera página sin cursor).
func (app *ApiContact) GetMessages(id_user uint, id_contact uint, ctx context.Context) ([]models.Message, error) {
	messages, _, err := app.GetMessagesPage(id_user, id_contact, 0, 200, ctx)
	return messages, err
}

// GetMessagesPage devuelve hasta limit mensajes de la conversación en orden
// cronológico (más antiguo primero), excluyendo los borrados por cada parte.
// Si before > 0 solo incluye mensajes con id < before (cursor por id, estable
// con timestamps repetidos). hasMore indica si existen mensajes más antiguos;
// se calcula pidiendo limit+1 filas.
func (app *ApiContact) GetMessagesPage(id_user uint, id_contact uint, before uint, limit int, ctx context.Context) ([]models.Message, bool, error) {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	var messages []models.Message
	q := app.data.Model(&models.Message{}).WithContext(c).
		Where("((id_user = ? AND id_receptor = ? AND deleted_by_sender = ?) OR (id_user = ? AND id_receptor = ? AND deleted_by_receiver = ?))", id_user, id_contact, false, id_contact, id_user, false)
	if before > 0 {
		q = q.Where("id < ?", before)
	}
	// DESC + LIMIT para obtener los más recientes de la página; luego se invierte.
	result := q.Order("id DESC").Limit(limit + 1).Scan(&messages)
	if result.Error != nil {
		return nil, false, result.Error
	}
	hasMore := len(messages) > limit
	if hasMore {
		messages = messages[:limit]
	}
	// Invertir para devolver en orden cronológico (más antiguo primero)
	for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
		messages[i], messages[j] = messages[j], messages[i]
	}
	return messages, hasMore, nil
}

// conversationVisibility es el predicado de visibilidad de la conversación
// userID<->contactID: excluye los mensajes borrados "para mí" por cada parte.
const conversationVisibility = "((id_user = ? AND id_receptor = ? AND deleted_by_sender = ?) OR (id_user = ? AND id_receptor = ? AND deleted_by_receiver = ?))"

func (app *ApiContact) visibleConversation(c context.Context, userID, contactID uint) *gorm.DB {
	return app.data.Model(&models.Message{}).WithContext(c).
		Where(conversationVisibility, userID, contactID, false, contactID, userID, false)
}

// GetMessagesAround devuelve una ventana cronológica centrada en el mensaje
// around: hasta limit/2 mensajes anteriores, el objetivo y hasta limit/2
// posteriores (solo los visibles para el usuario). hasOlder/hasNewer indican si
// hay más mensajes fuera de la ventana. Si el objetivo no existe o no es
// visible devuelve models.ErrMessageNotFound.
func (app *ApiContact) GetMessagesAround(userID, contactID, around uint, limit int, ctx context.Context) ([]models.Message, bool, bool, error) {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	half := limit / 2
	if half < 1 {
		half = 1
	}

	var target models.Message
	res := app.visibleConversation(c, userID, contactID).Where("id = ?", around).Limit(1).Scan(&target)
	if res.Error != nil {
		return nil, false, false, res.Error
	}
	if res.RowsAffected == 0 {
		return nil, false, false, models.ErrMessageNotFound
	}

	var older []models.Message
	if err := app.visibleConversation(c, userID, contactID).Where("id < ?", around).
		Order("id DESC").Limit(half + 1).Scan(&older).Error; err != nil {
		return nil, false, false, err
	}
	var newer []models.Message
	if err := app.visibleConversation(c, userID, contactID).Where("id > ?", around).
		Order("id ASC").Limit(half + 1).Scan(&newer).Error; err != nil {
		return nil, false, false, err
	}
	hasOlder := len(older) > half
	if hasOlder {
		older = older[:half]
	}
	hasNewer := len(newer) > half
	if hasNewer {
		newer = newer[:half]
	}

	out := make([]models.Message, 0, len(older)+1+len(newer))
	for i := len(older) - 1; i >= 0; i-- {
		out = append(out, older[i])
	}
	out = append(out, target)
	out = append(out, newer...)
	return out, hasOlder, hasNewer, nil
}

// GetMessagesAfter devuelve hasta limit mensajes visibles con id > after en
// orden cronológico; hasNewer indica si quedan más posteriores.
func (app *ApiContact) GetMessagesAfter(userID, contactID, after uint, limit int, ctx context.Context) ([]models.Message, bool, error) {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	var msgs []models.Message
	if err := app.visibleConversation(c, userID, contactID).Where("id > ?", after).
		Order("id ASC").Limit(limit + 1).Scan(&msgs).Error; err != nil {
		return nil, false, err
	}
	hasNewer := len(msgs) > limit
	if hasNewer {
		msgs = msgs[:limit]
	}
	return msgs, hasNewer, nil
}

// PutStatusMessageDelivered marca como 'entregado' los mensajes con estado 'enviado'
// cuyo receptor coincide con id_message (id del receptor).
func (app *ApiContact) PutStatusMessageDelivered(id_message uint, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	return app.data.Model(&models.Message{}).WithContext(c).
		Where("id_receptor = ?", id_message).
		Where("status = ?", "enviado").
		Update("status", "entregado").Error
}

// GetSenderTelephonsWithPendingMessages retorna los telephons de usuarios que enviaron
// mensajes en estado "enviado" al receptor indicado (para notificarles al conectarse).
func (app *ApiContact) GetSenderTelephonsWithPendingMessages(id_receiver uint, ctx context.Context) ([]string, error) {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	var telephons []string
	result := app.data.WithContext(c).
		Table("messages").
		Select("DISTINCT user_data_bases.telephon").
		Joins("INNER JOIN user_data_bases ON messages.id_user = user_data_bases.id").
		Where("messages.id_receptor = ? AND messages.status = ? AND messages.deleted_at IS NULL", id_receiver, "enviado").
		Scan(&telephons)
	if result.Error != nil {
		return nil, result.Error
	}
	return telephons, nil
}

// PutStatusMessageSeenByContact marca como 'visto' los mensajes enviados por id_sender
// al id_receptor que estaban en estado 'enviado' o 'entregado'.
func (app *ApiContact) PutStatusMessageSeenByContact(id_sender uint, id_receptor uint, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	return app.data.Model(&models.Message{}).WithContext(c).
		Where("id_user = ? AND id_receptor = ?", id_sender, id_receptor).
		Where("status IN ?", []string{"enviado", "entregado"}).
		Update("status", "visto").Error
}

// GetRecentMessagesForUser obtiene, para cada conversación del usuario, los
// últimos perChat mensajes que no ha borrado (Clear Chat / borrar para mí),
// en orden cronológico. Usa una función de ventana para no cargar el
// historial completo de todas las conversaciones en memoria.
func (app *ApiContact) GetRecentMessagesForUser(id_user uint, perChat int, ctx context.Context) ([]models.Message, error) {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	var messages []models.Message
	result := app.data.WithContext(c).Raw(`
		SELECT * FROM (
			SELECT m.*, ROW_NUMBER() OVER (
				PARTITION BY CASE WHEN m.id_user = @user THEN m.id_receptor ELSE m.id_user END
				ORDER BY m.time DESC, m.id DESC
			) AS rn
			FROM messages m
			WHERE m.deleted_at IS NULL
			  AND ((m.id_user = @user AND m.deleted_by_sender = false)
			    OR (m.id_receptor = @user AND m.deleted_by_receiver = false))
		) recent
		WHERE recent.rn <= @limit
		ORDER BY recent.time ASC, recent.id ASC`,
		sql.Named("user", id_user), sql.Named("limit", perChat)).
		Scan(&messages)
	if result.Error != nil {
		return nil, result.Error
	}
	return messages, nil
}

// ClearChatForUser marca todos los mensajes entre id_user y id_contact como
// borrados para id_user (ambas actualizaciones en una sola transacción).
func (app *ApiContact) ClearChatForUser(id_user uint, id_contact uint, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	return app.data.WithContext(c).Transaction(func(tx *gorm.DB) error {
		// 1. Mensajes donde el usuario es el remitente
		if err := tx.Model(&models.Message{}).
			Where("id_user = ? AND id_receptor = ?", id_user, id_contact).
			Update("deleted_by_sender", true).Error; err != nil {
			return err
		}
		// 2. Mensajes donde el usuario es el receptor
		return tx.Model(&models.Message{}).
			Where("id_user = ? AND id_receptor = ?", id_contact, id_user).
			Update("deleted_by_receiver", true).Error
	})
}

// GetAddedContactIDs devuelve el conjunto de IDs de contactos que el usuario tiene agregados
func (app *ApiContact) GetAddedContactIDs(id_user uint, ctx context.Context) (map[uint]string, error) {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	type row struct {
		IdContact   uint
		ContactName string
	}
	var rows []row
	result := app.data.Model(&models.ContactDataBase{}).WithContext(c).
		Select("id_contact, contact_name").
		Where("id_user = ? AND status != ?", id_user, "rejected").
		Scan(&rows)
	if result.Error != nil {
		return nil, result.Error
	}
	m := make(map[uint]string, len(rows))
	for _, r := range rows {
		m[r.IdContact] = r.ContactName
	}
	return m, nil
}

// GetUsersBasicByIDs obtiene en una sola consulta los datos públicos de varios
// usuarios, indexados por ID (evita el patrón N+1 en listados).
func (app *ApiContact) GetUsersBasicByIDs(ids []uint, ctx context.Context) (map[uint]models.UserBasic, error) {
	result := make(map[uint]models.UserBasic, len(ids))
	if len(ids) == 0 {
		return result, nil
	}
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	var users []models.UserBasic
	if err := app.data.WithContext(c).Model(&models.UserDataBase{}).
		Select("id", "telephon", "username", "avatar_url").
		Where("id IN ?", ids).
		Scan(&users).Error; err != nil {
		return nil, err
	}
	for _, u := range users {
		result[u.ID] = u
	}
	return result, nil
}

// GetUsernameByTelephon obtiene el username por número de teléfono
func (app *ApiContact) GetUsernameByTelephon(telephon string, ctx context.Context) (string, error) {
	c, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	var username string
	result := app.data.Model(&models.UserDataBase{}).WithContext(c).Select("username").Where("telephon = ?", telephon).Scan(&username)
	if result.Error != nil || username == "" {
		return "", errors.New("username no encontrado")
	}
	return username, nil
}

// GetTelephonByUsername obtiene el número de teléfono por username
func (app *ApiContact) GetTelephonByUsername(username string, ctx context.Context) (string, error) {
	c, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	var telephon string
	result := app.data.Model(&models.UserDataBase{}).WithContext(c).Select("telephon").Where("username = ?", username).Scan(&telephon)
	if result.Error != nil || telephon == "" {
		return "", errors.New("telefono no encontrado")
	}
	return telephon, nil
}

// GetIdByTelephon obtiene el ID de usuario por número de teléfono, usando Redis como caché (Cache-Aside)
func (app *ApiContact) GetIdByTelephon(telephon string, ctx context.Context) (int, error) {
	cacheKey := fmt.Sprintf("user:id:%s", telephon)

	// 1. Intentar obtener de Redis
	if app.rd != nil {
		idStr, err := app.rd.Get(ctx, cacheKey).Result()
		if err == nil {
			id, err := strconv.Atoi(idStr)
			if err == nil {
				return id, nil
			}
		}
	}

	// 2. Si no está en caché o hay error, consultar BD
	c, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	var id int
	result := app.data.Model(&models.UserDataBase{}).WithContext(c).Select("id").Where("telephon = ?", telephon).Scan(&id)
	if result.Error != nil {
		return -1, fmt.Errorf("buscar id de usuario: %w", result.Error)
	}
	if id == 0 {
		return -1, models.ErrUserNotFound
	}

	// 3. Guardar en Redis para futuras consultas (TTL 24h)
	if app.rd != nil {
		app.rd.Set(ctx, cacheKey, id, 24*time.Hour)
	}

	return id, nil
}

// GetCachedContactsTelephons obtiene la lista bidireccional de contactos con caché en Redis
func (app *ApiContact) GetCachedContactsTelephons(telephon string, ctx context.Context) []string {
	cacheKey := fmt.Sprintf("user:contacts:%s", telephon)

	// 1. Intentar obtener de Redis
	if app.rd != nil {
		contacts, err := app.rd.SMembers(ctx, cacheKey).Result()
		if err == nil && len(contacts) > 0 {
			return contacts
		}
	}

	// 2. Si no está en caché o está vacío, consultar BD
	id, err := app.GetIdByTelephon(telephon, ctx)
	if err != nil {
		return []string{}
	}

	// Dirección 1: personas que YO tengo agregadas
	contacts, err := app.GetContactsTelephons(uint(id), ctx)
	if err != nil {
		contacts = &[]models.ContactChat{}
	}

	// Dirección 2: personas que ME tienen agregado a mí
	reverse, err := app.GetUsersWhoHaveMeAsContactTelephons(uint(id), ctx)
	if err != nil {
		reverse = []string{}
	}

	// Unión sin duplicados
	seen := make(map[string]struct{})
	var result []string
	for _, t := range *contacts {
		if t.Status == "accepted" {
			if _, ok := seen[t.Number]; !ok {
				seen[t.Number] = struct{}{}
				result = append(result, t.Number)
			}
		}
	}
	for _, t := range reverse {
		if _, ok := seen[t]; !ok {
			seen[t] = struct{}{}
			result = append(result, t)
		}
	}

	// 3. Guardar en Redis (TTL 1h)
	if app.rd != nil && len(result) > 0 {
		// Usamos un set para evitar duplicados en Redis y facilitar búsquedas futuras
		app.rd.SAdd(ctx, cacheKey, result)
		app.rd.Expire(ctx, cacheKey, 1*time.Hour)
	}

	return result
}

// GetTelephonByID obtiene solo el número de teléfono de un usuario por su ID (más eficiente que GetUserByID)
func (app *ApiContact) GetTelephonByID(id uint, ctx context.Context) (string, error) {
	c, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	var telephon string
	result := app.data.Model(&models.UserDataBase{}).WithContext(c).
		Select("telephon").Where("id = ?", id).Scan(&telephon)
	if result.Error != nil || telephon == "" {
		return "", errors.New("telefono no encontrado para id")
	}
	return telephon, nil
}

// GetContactsTelephons obtiene lista de contactos con sus números de teléfono (personas que YO tengo agregadas)
func (app *ApiContact) GetContactsTelephons(id uint, ctx context.Context) (*[]models.ContactChat, error) {
	c, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	var contacts []models.ContactChat
	result := app.data.WithContext(c).Table("user_data_bases").
		Select(`
			user_data_bases.username AS username,
			user_data_bases.telephon AS number,
			contact_data_bases.status AS status
		`).
		Joins("INNER JOIN contact_data_bases ON user_data_bases.id = contact_data_bases.id_contact").
		Where("contact_data_bases.id_user = ?", id).
		Where("contact_data_bases.status != ?", "rejected").
		Order("contact_data_bases.created_at DESC").
		Scan(&contacts)
	return &contacts, result.Error
}

// GetUsersWhoHaveMeAsContactTelephons obtiene los números de teléfono de usuarios que ME tienen agregado a mí (solo aceptados)
func (app *ApiContact) GetUsersWhoHaveMeAsContactTelephons(myID uint, ctx context.Context) ([]string, error) {
	c, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	var telephons []string
	result := app.data.WithContext(c).Table("user_data_bases").
		Select("user_data_bases.telephon").
		Joins("INNER JOIN contact_data_bases ON user_data_bases.id = contact_data_bases.id_user").
		Where("contact_data_bases.id_contact = ? AND contact_data_bases.status = ?", myID, "accepted").
		Scan(&telephons)
	return telephons, result.Error
}

func (app *ApiContact) PutContactByTelephon(id_user uint, id_contact uint, contactName string, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	result := app.data.WithContext(c).Table("contact_data_bases").
		Where("id_user = ? AND id_contact = ?", id_user, id_contact).
		Update("contact_name", contactName)
	if result.Error != nil {
		return result.Error
	}
	return nil
}

// UpdateLastSeen actualiza la última hora de conexión de un usuario
func (app *ApiContact) UpdateLastSeen(telephon string, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	return app.data.Model(&models.UserDataBase{}).WithContext(c).
		Where("telephon = ?", telephon).
		Update("last_seen", time.Now()).Error
}

// UpdateMessageContent actualiza el contenido de un mensaje y lo marca como editado.
// Solo el remitente (id_sender) puede editar su propio mensaje.
func (app *ApiContact) UpdateMessageContent(messageID uint, idSender uint, newContent string, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	result := app.data.Model(&models.Message{}).WithContext(c).
		Where("id = ? AND id_user = ?", messageID, idSender).
		Updates(map[string]interface{}{
			"message": newContent,
			"edited":  true,
		})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return errors.New("mensaje no encontrado o no tienes permiso para editarlo")
	}
	return nil
}

// GetMessageByID obtiene un mensaje por su ID
func (app *ApiContact) GetMessageByID(messageID uint, ctx context.Context) (*models.Message, error) {
	c, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	var msg models.Message
	result := app.data.Model(&models.Message{}).WithContext(c).Where("id = ?", messageID).First(&msg)
	if result.Error != nil {
		return nil, result.Error
	}
	return &msg, nil
}

func (app *ApiContact) DeleteMessageForSender(messageID uint, idSender uint, ctx context.Context) (*models.Message, error) {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	var msg models.Message
	find := app.data.Model(&models.Message{}).WithContext(c).
		Where("id = ? AND id_user = ?", messageID, idSender).
		First(&msg)
	if find.Error != nil {
		return nil, find.Error
	}
	del := app.data.WithContext(c).Delete(&msg)
	if del.Error != nil {
		return nil, del.Error
	}
	if del.RowsAffected == 0 {
		return nil, errors.New("mensaje no encontrado o no tienes permiso para eliminarlo")
	}
	return &msg, nil
}

// DeleteMessageForMe marca un mensaje como borrado solo para el usuario actual
func (app *ApiContact) DeleteMessageForMe(messageID uint, userID uint, ctx context.Context) (*models.Message, error) {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	var msg models.Message
	find := app.data.Model(&models.Message{}).WithContext(c).
		Where("id = ? AND (id_user = ? OR id_receptor = ?)", messageID, userID, userID).
		First(&msg)
	if find.Error != nil {
		return nil, find.Error
	}

	// Actualizar la bandera correspondiente
	updates := map[string]interface{}{}
	if msg.IdUser == userID {
		updates["deleted_by_sender"] = true
	}
	if msg.IdReceptor == userID {
		updates["deleted_by_receiver"] = true
	}

	update := app.data.Model(&models.Message{}).WithContext(c).Where("id = ?", messageID).Updates(updates)
	if update.Error != nil {
		return nil, update.Error
	}

	return &msg, nil
}

// UpdateWallpaperByTelephon actualiza el fondo de pantalla global del usuario
func (ap *ApiContact) UpdateWallpaperByTelephon(telephon string, wallpaperUrl string, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	result := ap.data.Model(&models.UserDataBase{}).WithContext(c).
		Where("telephon = ?", telephon).
		Update("wallpaper_url", wallpaperUrl)
	if result.Error != nil {
		return errors.New("error al actualizar fondo de pantalla")
	}
	return nil
}

// UpdateContactWallpaper actualiza el fondo de pantalla específico de un chat (contacto)
func (app *ApiContact) UpdateContactWallpaper(id_user uint, id_contact uint, wallpaperUrl string, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	result := app.data.WithContext(c).Table("contact_data_bases").
		Where("id_user = ? AND id_contact = ?", id_user, id_contact).
		Update("wallpaper_url", wallpaperUrl)
	if result.Error != nil {
		return result.Error
	}
	return nil
}
