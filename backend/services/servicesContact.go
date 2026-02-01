package services

import (
	"context"
	"errors"
	"gorm/backend/models"
	"gorm/backend/repos"
	"gorm/backend/schemas"
	"strings"
)

type ServiceApiContact struct {
	client *repos.ApiContact
}

func InitServiceContact(cliente *repos.ApiContact) *ServiceApiContact {
	return &ServiceApiContact{
		client: cliente,
	}
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

func (sr *ServiceApiContact) AddContact(username string, number string, ctx context.Context) (*models.ContactChat, error) {
	id_user, err := sr.client.GetIdUsername(username, ctx)
	if err != nil {
		return nil, err
	}
	id_contact, err := sr.client.GetNumberUsername(number, ctx)
	if err != nil {
		return nil, err
	}

	contact := models.ContactDataBase{
		IdUser:    uint(id_user),
		IdContact: uint(id_contact),
		Status:    "accepted",
	}
	contactAdd := models.ContactDataBase{
		IdUser:    uint(id_contact),
		IdContact: uint(id_user),
		Status:    "pending",
	}

	exist := sr.client.ExistContactAdd(contact.IdUser, contact.IdContact, ctx)
	existContact := sr.client.ExistContactAdd(contact.IdContact, contact.IdUser, ctx)
	
	// Iniciar transacción para operaciones de contacto
	tx := sr.client.BeginTx()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()
	
	if exist && existContact {
		if err := sr.client.PutStatusTx(tx, contact.IdUser, contact.IdContact, "accepted", ctx); err != nil {
			tx.Rollback()
			return nil, errors.New("error al cambiar status del contacto")
		}
	} else {
		if !exist {
			if err := sr.client.AddContactTx(tx, contact, ctx); err != nil {
				tx.Rollback()
				return nil, errors.New("error al registrar contacto")
			}
		}
		if !existContact {
			if err := sr.client.AddContactTx(tx, contactAdd, ctx); err != nil {
				tx.Rollback()
				return nil, errors.New("error al registrar contacto")
			}
		}
	}
	
	// Commit transacción
	if err := tx.Commit().Error; err != nil {
		return nil, errors.New("error al completar operación de contacto")
	}

	contactChat, err := sr.client.GetContactNumber(number, ctx)
	if err != nil {
		return nil, err
	}
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

func (sr *ServiceApiContact) ServiceGetContactByNumber(number string, ctx context.Context) (*models.ContactChat, error) {
	contact, err := sr.client.GetContactNumber(number, ctx)
	return contact, err
}

func (sr *ServiceApiContact) ServiceContactPut(contact models.ContactPut, ctx context.Context) error {
	id_user, err := sr.client.GetIdUsername(contact.Username, ctx)
	if  err != nil {
		return err
	}
	id_contact, err := sr.client.GetIdUsername(contact.UsernameAdd, ctx)
	if err != nil {
		return err
	}
	
	var status string
	if answer := strings.ToLower(contact.Answer); answer == "yes" {
		status = "accepted"
	}else {
		status = "rechazed"
	}
	err = sr.client.PutStatus(uint(id_user), uint(id_contact), status, ctx)
	return err
}


