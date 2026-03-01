package repos

import (
	"context"
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
	log.Println("Buscando usuario:", username)
	var user schemas.UserGet
	result := ap.data.WithContext(c).
		Table("user_data_bases").
		Where("username = ?", strings.TrimSpace(username)).
		Select("username", "telephon", "gmail", "avatar_url", "wallpaper_url").
		Scan(&user)
	if result.Error != nil {
		log.Println("Error en query:", result.Error)
		return nil, result.Error
	}
	log.Println("Usuario encontrado:", user)
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
		Where("telephon = ?", strings.TrimSpace(telephon)).
		Select("username", "telephon", "gmail", "avatar_url", "wallpaper_url").
		Scan(&user)
	if result.Error != nil {
		return nil, result.Error
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

// AddContact persiste una nueva relación de contacto en la BD.
func (ap *ApiContact) AddContact(contact models.ContactDataBase, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	return ap.data.Model(&models.ContactDataBase{}).WithContext(c).Create(&contact).Error
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
		Where("NOT contact_data_bases.status = ?", "rechazed").
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
func (app *ApiContact) GetMessages(id_user uint, id_contact uint, ctx context.Context) ([]models.Message, error) {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	var messages []models.Message
	result := app.data.Model(&models.Message{}).WithContext(c).
		Where("((id_user = ? AND id_receptor = ? AND deleted_by_sender = ?) OR (id_user = ? AND id_receptor = ? AND deleted_by_receiver = ?))", id_user, id_contact, false, id_contact, id_user, false).
		Order("time ASC").
		Scan(&messages)
	if result.Error != nil {
		return nil, result.Error
	}
	return messages, nil
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

// GetAllMessagesForUser obtiene todos los mensajes donde el usuario es remitente o receptor
// y que no han sido borrados por él (Clear Chat)
func (app *ApiContact) GetAllMessagesForUser(id_user uint, ctx context.Context) ([]models.Message, error) {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	var messages []models.Message
	result := app.data.Model(&models.Message{}).WithContext(c).
		Where("(id_user = ? AND deleted_by_sender = ?) OR (id_receptor = ? AND deleted_by_receiver = ?)", id_user, false, id_user, false).
		Order("time ASC").
		Scan(&messages)
	if result.Error != nil {
		return nil, result.Error
	}
	return messages, nil
}

// ClearChatForUser marca todos los mensajes entre id_user y id_contact como borrados para id_user
func (app *ApiContact) ClearChatForUser(id_user uint, id_contact uint, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	// 1. Mensajes donde el usuario es el remitente
	err1 := app.data.Model(&models.Message{}).WithContext(c).
		Where("id_user = ? AND id_receptor = ?", id_user, id_contact).
		Update("deleted_by_sender", true).Error

	// 2. Mensajes donde el usuario es el receptor
	err2 := app.data.Model(&models.Message{}).WithContext(c).
		Where("id_user = ? AND id_receptor = ?", id_contact, id_user).
		Update("deleted_by_receiver", true).Error

	if err1 != nil {
		return err1
	}
	return err2
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
		Where("id_user = ? AND status != ?", id_user, "rechazed").
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

// GetUserByID obtiene un usuario por su ID primario
func (app *ApiContact) GetUserByID(id uint, ctx context.Context) (*models.UserDataBase, error) {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	var user models.UserDataBase
	result := app.data.Model(&models.UserDataBase{}).WithContext(c).
		Where("id = ?", id).
		First(&user)
	if result.Error != nil {
		return nil, result.Error
	}
	return &user, nil
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
	if result.Error != nil || id == 0 {
		return -1, errors.New("id usuario no encontrado")
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
		Where("NOT contact_data_bases.status = ?", "rechazed").
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
