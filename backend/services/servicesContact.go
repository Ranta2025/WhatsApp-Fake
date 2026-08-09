package services

import (
	"context"
	"errors"
	"fmt"
	"gorm/backend/models"
	"gorm/backend/schemas"
	"gorm/backend/utils"
	"log"

	"gorm.io/gorm"
)

type ContactServicer interface {
	GetTelephonByUsername(username string, ctx context.Context) (string, error)
	ServicesGetUser(username string, ctx context.Context) (*schemas.UserGet, error)
	ServicePutUser(username string, usernameUpdate string, ctx context.Context) (*schemas.UserGet, error)
	AddContact(username string, contactAdd models.ContactAdd, ctx context.Context) (*models.ContactChat, error)
	ServiceGetContacts(username string, ctx context.Context) (*[]models.ContactChat, error)
	ServicesGetUserByTelephon(telephon string, ctx context.Context) (*schemas.UserGet, error)
	ServicePutUserByTelephon(telephon string, usernameUpdate string, ctx context.Context) (*schemas.UserGet, string, error)
	ServiceUpdateUsername(telephon string, newUsername string, ctx context.Context) (*schemas.UserGet, string, string, error)
	AddContactByTelephon(telephon string, contactAdd models.ContactAdd, ctx context.Context) (*models.ContactChat, error)
	ServiceGetContactsByTelephon(telephon string, ctx context.Context) (*[]models.ContactChat, error)
	ServicePutContactByTelephon(contact models.ContactPut, ctx context.Context) (*models.ContactChat, error)
	ServiceUpdateAvatar(telephon string, avatarUrl string, ctx context.Context) error
	ServiceUpdateWallpaper(telephon string, wallpaperUrl string, ctx context.Context) error
	ServiceUpdateContactWallpaper(myTelephon string, contactTelephon string, wallpaperUrl string, ctx context.Context) error
}

type ContactRepoInterface interface {
	GetTelephonByUsername(username string, ctx context.Context) (string, error)
	GetUserDataBase(username string, ctx context.Context) (*schemas.UserGet, error)
	RepoPutUser(username string, usernameUpdate string, ctx context.Context) error
	GetUserDataBaseByTelephon(telephon string, ctx context.Context) (*schemas.UserGet, error)
	RepoPutUserByTelephon(telephon string, usernameUpdate string, ctx context.Context) error
	UpdateAvatarByTelephon(telephon string, avatarUrl string, ctx context.Context) error
	UpdateWallpaperByTelephon(telephon string, wallpaperUrl string, ctx context.Context) error
	UpdateContactWallpaper(myID uint, contactID uint, wallpaperUrl string, ctx context.Context) error
	GetIdUsername(username string, ctx context.Context) (int, error)
	GetNumberUsername(number string, ctx context.Context) (int, error)
	ExistContactAdd(userID uint, contactID uint, ctx context.Context) (bool, error)
	ExistContactAddTx(tx *gorm.DB, userID uint, contactID uint, ctx context.Context) (bool, error)
	AddContact(contact models.ContactDataBase, ctx context.Context) error
	AddContactTx(tx *gorm.DB, contact models.ContactDataBase, ctx context.Context) error
	GetContactNumber(number string, ctx context.Context) (*models.ContactChat, error)
	GetContactsNumber(userID uint, ctx context.Context) (*[]models.ContactChat, error)
	GetUsernameByTelephon(telephon string, ctx context.Context) (string, error)
	GetIdByTelephon(telephon string, ctx context.Context) (int, error)
	PutContactByTelephon(userID uint, contactID uint, contactName string, ctx context.Context) error
	BeginTx() *gorm.DB
	InvalidateUserIDCache(telephon string, ctx context.Context)
	InvalidateContactsCache(telephon string, ctx context.Context)
}

type ServiceApiContact struct {
	client ContactRepoInterface
}

func InitServiceContact(cliente ContactRepoInterface) ContactServicer {
	return &ServiceApiContact{
		client: cliente,
	}
}

func (sr *ServiceApiContact) GetTelephonByUsername(username string, ctx context.Context) (string, error) {
	return sr.client.GetTelephonByUsername(username, ctx)
}

func (sr *ServiceApiContact) ServicesGetUser(username string, ctx context.Context) (*schemas.UserGet, error) {
	user, err := sr.client.GetUserDataBase(username, ctx)
	return user, err
}

func (sr *ServiceApiContact) ServicePutUser(username string, usernameUpdate string, ctx context.Context) (*schemas.UserGet, error) {
	if username == usernameUpdate {
		return nil, errors.New("Proporciono el mismo usuario")
	}

	err := sr.client.RepoPutUser(username, usernameUpdate, ctx)
	if err != nil {
		return nil, err
	}
	user, err := sr.ServicesGetUser(usernameUpdate, ctx)
	if err != nil {
		return nil, err
	}
	return user, nil
}

func (sr *ServiceApiContact) addContactByUserIDs(userID uint, contactID uint, contactName string, contactNumber string, ctx context.Context) (*models.ContactChat, error) {
	if userID == contactID {
		return nil, errors.New("no puedes agregarte a ti mismo como contacto")
	}

	tx := sr.client.BeginTx()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	exist, err := sr.client.ExistContactAddTx(tx, userID, contactID, ctx)
	if err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("error al verificar contacto: %w", err)
	}
	if exist {
		tx.Rollback()
		return nil, errors.New("contacto ya existente")
	}

	contact := models.ContactDataBase{
		IdUser:      userID,
		IdContact:   contactID,
		Status:      "accepted",
		ContactName: contactName,
	}

	if err := sr.client.AddContactTx(tx, contact, ctx); err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("error al registrar contacto: %w", err)
	}

	if err := tx.Commit().Error; err != nil {
		return nil, fmt.Errorf("error al confirmar contacto: %w", err)
	}

	contactChat, err := sr.client.GetContactNumber(contactNumber, ctx)
	if err != nil {
		return nil, err
	}

	contactChat.ContactName = contactName
	contactChat.Status = "accepted"

	return contactChat, nil
}

func (sr *ServiceApiContact) AddContact(username string, contactAdd models.ContactAdd, ctx context.Context) (*models.ContactChat, error) {
	id_user, err := sr.client.GetIdUsername(username, ctx)
	if err != nil {
		return nil, err
	}

	id_contact, err := sr.client.GetNumberUsername(contactAdd.Number, ctx)
	if err != nil {
		return nil, err
	}

	contactChat, err := sr.addContactByUserIDs(uint(id_user), uint(id_contact), contactAdd.ContactName, contactAdd.Number, ctx)
	if err != nil {
		return nil, err
	}

	sr.client.InvalidateContactsCache(username, ctx)
	sr.client.InvalidateContactsCache(contactAdd.Number, ctx)

	return contactChat, nil
}

func (sr *ServiceApiContact) ServiceGetContacts(username string, ctx context.Context) (*[]models.ContactChat, error) {
	id, err := sr.client.GetIdUsername(username, ctx)
	if err != nil {
		return nil, err
	}

	contacts, err := sr.client.GetContactsNumber(uint(id), ctx)
	if err != nil {
		return nil, err
	}
	if contacts == nil {
		return nil, errors.New("Error al extraer contactos")
	}
	return contacts, nil
}

func (sr *ServiceApiContact) ServicesGetUserByTelephon(telephon string, ctx context.Context) (*schemas.UserGet, error) {
	user, err := sr.client.GetUserDataBaseByTelephon(telephon, ctx)
	return user, err
}

func (sr *ServiceApiContact) ServicePutUserByTelephon(telephon string, usernameUpdate string, ctx context.Context) (*schemas.UserGet, string, error) {
	oldUsername, err := sr.client.GetUsernameByTelephon(telephon, ctx)
	if err != nil {
		return nil, "", errors.New("usuario no encontrado")
	}

	if oldUsername == usernameUpdate {
		return nil, "", errors.New("Proporciono el mismo usuario")
	}

	err = sr.client.RepoPutUserByTelephon(telephon, usernameUpdate, ctx)
	if err != nil {
		return nil, "", err
	}
	user, err := sr.ServicesGetUserByTelephon(telephon, ctx)
	if err != nil {
		return nil, "", err
	}
	return user, oldUsername, nil
}

func (sr *ServiceApiContact) ServiceUpdateUsername(telephon string, newUsername string, ctx context.Context) (*schemas.UserGet, string, string, error) {
	user, oldUsername, err := sr.ServicePutUserByTelephon(telephon, newUsername, ctx)
	if err != nil {
		return nil, "", "", err
	}

	token, err := utils.GenerateToken(user.Username, user.Telephon)
	if err != nil {
		log.Printf("[SERVICE] Error generando token en ServiceUpdateUsername: %v", err)
		return nil, "", "", errors.New("error interno del servidor")
	}

	return user, oldUsername, token, nil
}

func (sr *ServiceApiContact) AddContactByTelephon(telephon string, contactAdd models.ContactAdd, ctx context.Context) (*models.ContactChat, error) {
	id_user, err := sr.client.GetIdByTelephon(telephon, ctx)
	if err != nil {
		return nil, err
	}

	id_contact, err := sr.client.GetNumberUsername(contactAdd.Number, ctx)
	if err != nil {
		return nil, err
	}

	contactChat, err := sr.addContactByUserIDs(uint(id_user), uint(id_contact), contactAdd.ContactName, contactAdd.Number, ctx)
	if err != nil {
		return nil, err
	}

	sr.client.InvalidateContactsCache(telephon, ctx)
	sr.client.InvalidateContactsCache(contactAdd.Number, ctx)

	return contactChat, nil
}

func (sr *ServiceApiContact) ServiceGetContactsByTelephon(telephon string, ctx context.Context) (*[]models.ContactChat, error) {
	id, err := sr.client.GetIdByTelephon(telephon, ctx)
	if err != nil {
		return nil, err
	}

	contacts, err := sr.client.GetContactsNumber(uint(id), ctx)
	if err != nil {
		return nil, err
	}
	if contacts == nil {
		return nil, errors.New("Error al extraer contactos")
	}
	return contacts, nil
}

func (sr *ServiceApiContact) ServicePutContactByTelephon(contact models.ContactPut, ctx context.Context) (*models.ContactChat, error) {
	id_user, err := sr.client.GetIdByTelephon(contact.Number, ctx)
	if err != nil {
		return nil, errors.New("usuario no encontrado")
	}
	id_contact, err := sr.client.GetIdByTelephon(contact.GetContactPut.Number, ctx)
	if err != nil {
		return nil, errors.New("contacto no encontrado")
	}
	if id_user == id_contact {
		return nil, errors.New("no puedes editar tu propio contacto")
	}
	exist, err := sr.client.ExistContactAdd(uint(id_user), uint(id_contact), ctx)
	if err != nil {
		return nil, errors.New("error al verificar contacto")
	}
	if !exist {
		return nil, errors.New("contacto no existente")
	}
	err = sr.client.PutContactByTelephon(uint(id_user), uint(id_contact), contact.GetContactPut.ContactName, ctx)
	if err != nil {
		return nil, errors.New("error al actualizar contacto")
	}

	sr.client.InvalidateContactsCache(contact.Number, ctx)
	sr.client.InvalidateContactsCache(contact.GetContactPut.Number, ctx)

	contactChat, err := sr.client.GetContactNumber(contact.GetContactPut.Number, ctx)
	if err != nil {
		return nil, errors.New("error al obtener contacto actualizado")
	}
	contactChat.ContactName = contact.GetContactPut.ContactName
	contactChat.Status = "accepted"
	return contactChat, nil
}

func (sr *ServiceApiContact) ServiceUpdateAvatar(telephon string, avatarUrl string, ctx context.Context) error {
	return sr.client.UpdateAvatarByTelephon(telephon, avatarUrl, ctx)
}

func (sr *ServiceApiContact) ServiceUpdateWallpaper(telephon string, wallpaperUrl string, ctx context.Context) error {
	return sr.client.UpdateWallpaperByTelephon(telephon, wallpaperUrl, ctx)
}

func (sr *ServiceApiContact) ServiceUpdateContactWallpaper(myTelephon string, contactTelephon string, wallpaperUrl string, ctx context.Context) error {
	myID, err := sr.client.GetIdByTelephon(myTelephon, ctx)
	if err != nil {
		return err
	}
	contactID, err := sr.client.GetIdByTelephon(contactTelephon, ctx)
	if err != nil {
		return err
	}
	return sr.client.UpdateContactWallpaper(uint(myID), uint(contactID), wallpaperUrl, ctx)
}
