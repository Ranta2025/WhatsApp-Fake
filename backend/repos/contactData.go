package repos

import (
	"context"
	"errors"
	"gorm/backend/models"
	"gorm/backend/schemas"
	"log"
	"strings"
	"time"

	"gorm.io/gorm"
)

type ApiContact struct {
	data *gorm.DB
}

func InitRepoContact(data *gorm.DB) *ApiContact {
	return &ApiContact{
		data: data,
	}
}

// BeginTx inicia una transacción
func (ap *ApiContact) BeginTx() *gorm.DB {
	return ap.data.Begin()
}

func (ap *ApiContact) GetUserDataBase(username string, ctx context.Context) (*schemas.UserGet, error) {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	log.Println("Buscando usuario:", username)
	var user schemas.UserGet
	result := ap.data.WithContext(c).
		Table("user_data_bases").
		Where("username = ?", strings.TrimSpace(username)).
		Select("username", "telephon", "gmail").
		Scan(&user)
	if result.Error != nil {
		log.Println("Error en query:", result.Error)
		return nil, result.Error
	}
	log.Println("Usuario encontrado:", user)
	return &user, nil
}

func (ap *ApiContact) RepoPutUser(username string, usernameUpdate string, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	result := ap.data.Model(&models.UserDataBase{}).WithContext(c).Where("username = ?", username).Update("username", usernameUpdate)
	if result.Error != nil || result.RowsAffected == 0 {
		return errors.New("Error al modificar username")
	}
	return nil
}

func (ap *ApiContact) AddContact(contact models.ContactDataBase, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	return ap.data.Model(&models.ContactDataBase{}).WithContext(c).Create(&contact).Error
}

// AddContactTx agrega contacto dentro de una transacción
func (ap *ApiContact) AddContactTx(tx *gorm.DB, contact models.ContactDataBase, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	return tx.Model(&models.ContactDataBase{}).WithContext(c).Create(&contact).Error
}

func (ap *ApiContact) ExistContactAdd(idUser uint, IdContact uint, ctx context.Context) bool {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	var count int64
	result := ap.data.Model(&models.ContactDataBase{}).WithContext(c).Where("id_user = ?", idUser).Where("id_contact = ?", IdContact).Count(&count)
	if result.Error != nil {
		return false
	}
	return count > 0
}

// GetContactStatus obtiene el status de un contacto
func (ap *ApiContact) GetContactStatus(idUser uint, idContact uint, ctx context.Context) (string, error) {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	var contact models.ContactDataBase
	result := ap.data.Model(&models.ContactDataBase{}).WithContext(c).
		Where("id_user = ? AND id_contact = ?", idUser, idContact).
		First(&contact)
	if result.Error != nil {
		return "", result.Error
	}
	return contact.Status, nil
}

func (ap *ApiContact) PutStatus(id_user uint, id_contact uint, status string, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	return ap.data.Model(&models.ContactDataBase{}).
		WithContext(c).
		Where("id_user = ? AND id_contact = ?", id_user, id_contact).
		Or("id_user = ? AND id_contact = ?", id_contact, id_user).
		Update("status", status).Error
}

// PutStatusTx actualiza status dentro de una transacción
func (ap *ApiContact) PutStatusTx(tx *gorm.DB, id_user uint, id_contact uint, status string, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	return tx.Model(&models.ContactDataBase{}).
		WithContext(c).
		Where("id_user = ? AND id_contact = ?", id_user, id_contact).
		Update("status", status).Error
}

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
	contact.Status = "accepted"
	return &contact, nil
}

func (app *ApiContact) GetContactsNumber(id uint, ctx context.Context) (*[]models.ContactChat, error) {
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

func (app *ApiContact) CreateMessage(message models.Message, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	return app.data.Model(&models.Message{}).WithContext(c).Create(&message).Error
}

func (app *ApiContact) GetMessages(id_user uint, id_contact uint, ctx context.Context) ([]models.Message, error) {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	var messages []models.Message
	result := app.data.Model(&models.Message{}).WithContext(c).
		Where("(id_user = ? AND id_receptor = ?) OR (id_user = ? AND id_receptor = ?)", id_user, id_contact, id_contact, id_user).
		Order("time ASC").
		Scan(&messages)
	if result.Error != nil {
		return nil, result.Error
	}
	return messages, nil
}

func (app *ApiContact) PutStatusMessageDelivered(id_message uint, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	return app.data.Model(&models.Message{}).WithContext(c).
		Where("id_receptor = ?", id_message).
		Where("status = ?", "enviado").
		Update("status", "entregado").Error
}

func (app *ApiContact) PutStatusMessageSeen(id_message uint, id_user uint, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	return app.data.Model(&models.Message{}).WithContext(c).
		Where("id = ? AND id_receptor = ?", id_message, id_user).
		Where("status = ?", "entregado").
		Update("status", "visto").Error
}

func (app *ApiContact) PutStatusMessageSeenByContact(id_sender uint, id_receptor uint, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	return app.data.Model(&models.Message{}).WithContext(c).
		Where("id_user = ? AND id_receptor = ?", id_sender, id_receptor).
		Where("status = ?", "entregado").
		Update("status", "visto").Error
}

// PutStatusMessageDeliveredByContact actualiza mensajes de un remitente específico a "entregado"
func (app *ApiContact) PutStatusMessageDeliveredByContact(id_sender uint, id_receptor uint, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	return app.data.Model(&models.Message{}).WithContext(c).
		Where("id_user = ? AND id_receptor = ?", id_sender, id_receptor).
		Where("status = ?", "enviado").
		Update("status", "entregado").Error
}

// GetUserByNumber obtiene un usuario por su número de teléfono
func (app *ApiContact) GetUserByNumber(number string, ctx context.Context) (*models.UserDataBase, error) {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	var user models.UserDataBase
	result := app.data.Model(&models.UserDataBase{}).WithContext(c).
		Where("telephon = ?", strings.TrimSpace(number)).
		First(&user)
	if result.Error != nil {
		return nil, result.Error
	}
	return &user, nil
}
