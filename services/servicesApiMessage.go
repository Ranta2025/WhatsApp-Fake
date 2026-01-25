package services

import (
	"context"
	"errors"
	"gorm/models"
	"gorm/repos"
	"gorm/schemas"
)

type ServiceApiMessage struct {
	client *repos.ApiMessage
}

func InitServiceApiMessage(cliente *repos.ApiMessage) *ServiceApiMessage {
	return &ServiceApiMessage{
		client: cliente,
	}
}

func (sr *ServiceApiMessage) ServicesGetUser(username string, ctx context.Context) (*schemas.UserGet, error) {
	user, err := sr.client.GetUserDataBase(username, ctx)
	return user, err
}

func (sr *ServiceApiMessage) ServicePutUser(username string, usernameUpdate string, ctx context.Context) (*schemas.UserGet, error) {
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

func (sr *ServiceApiMessage) AddContact(username string, number string, ctx context.Context) (*models.ContactChat, error) {
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
	if exist && existContact {
		if err := sr.client.PutStatus(contact, "accepted", ctx); err != nil {
			return nil, errors.New("error al cambiar status del contacto")
		}
	} else {
		if !exist {
			if err := sr.client.AddContact(contact, ctx); err != nil {
				return nil, errors.New("error al registrar contacto")
			}
		}
		if !existContact {
			if err := sr.client.AddContact(contactAdd, ctx); err != nil {
				return nil, errors.New("error al registrar contacto")
			}
		}
	}

	contactChat, err := sr.client.GetContactNumber(number, ctx)
	if err != nil {
		return nil, err
	}
	return contactChat, nil
}

func (sr *ServiceApiMessage) ServiceGetContacts(username string, ctx context.Context) (*[]models.ContactChat, error) {
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

func (sr *ServiceApiMessage) ServiceGetContactByNumber(number string, ctx context.Context) (*models.ContactChat, error) {
	contact, err := sr.client.GetContactNumber(number, ctx)
	return contact, err
}
