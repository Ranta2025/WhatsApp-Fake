package repos

import (
	"context"
	"errors"
	"gorm/models"
	"gorm/schemas"
	"log"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/mongo"
	"gorm.io/gorm"
)

type ApiMessage struct {
	mongo *mongo.Client
	data  *gorm.DB
}

func InitRepoApiMessage(mongo *mongo.Client, data *gorm.DB) *ApiMessage {
	return &ApiMessage{
		mongo: mongo,
		data:  data,
	}
}

func (ap *ApiMessage) GetUserDataBase(username string, ctx context.Context) (*schemas.UserGet, error) {
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

func (ap *ApiMessage) RepoPutUser(username string, usernameUpdate string, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	result := ap.data.Model(&models.UserDataBase{}).WithContext(c).Where("username = ?", username).Update("username", usernameUpdate)
	if result.Error != nil || result.RowsAffected == 0 {
		return errors.New("Error al modificar username")
	}
	return nil
}

func (ap *ApiMessage) AddContact(contact models.ContactDataBase, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	return ap.data.Model(&models.ContactDataBase{}).WithContext(c).Create(&contact).Error
}

func (ap *ApiMessage) ExistContactAdd(idUser uint, IdContact uint, ctx context.Context) bool {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	var count int64
	result := ap.data.Model(&models.ContactDataBase{}).WithContext(c).Where("id_user = ?", idUser).Where("id_contact = ?", IdContact).Count(&count)
	if result.Error != nil {
		return false
	}
	return count > 0
}

func (ap *ApiMessage) PutStatus(contact models.ContactDataBase,status string,ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	return ap.data.Model(&models.ContactDataBase{}).
		WithContext(c).
		Where("id_user = ? AND id_contact = ?", contact.IdUser, contact.IdContact).
		Or("id_user = ? AND id_contact = ?", contact.IdContact, contact.IdUser).
		Update("status", status).Error
}

func (app *ApiMessage) GetIdUsername(username string, ctx context.Context) (int, error) {
	c, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	var id_user int
	result := app.data.Model(&models.UserDataBase{}).WithContext(c).Select("id").Where("username = ?", username).Scan(&id_user)
	if result.Error != nil || id_user == 0 {
		return -1, errors.New("id usuario no encontrado")
	}
	return id_user, nil
}

func (app *ApiMessage) GetNumberUsername(username string, ctx context.Context) (int, error) {
	c, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	var id_user int
	result := app.data.Model(&models.UserDataBase{}).WithContext(c).Select("id").Where("telephon = ?", username).Scan(&id_user)
	if result.Error != nil || id_user == 0 {
		return -1, errors.New("numero inexistente")
	}
	return id_user, nil
}

func (app *ApiMessage) GetContactNumber(number string, ctx context.Context) (*models.ContactChat, error) {
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

func (app *ApiMessage) GetContactsNumber(id uint, ctx context.Context) (*[]models.ContactChat, error) {
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
