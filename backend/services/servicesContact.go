package services

import (
	"context"
	"errors"
	"gorm/backend/models"
	"gorm/backend/schemas"
)

type ContactServicer interface {
	GetTelephonByUsername(username string, ctx context.Context) (string, error)
	ServicesGetUser(username string, ctx context.Context) (*schemas.UserGet, error)
	ServicePutUser(username string, usernameUpdate string, ctx context.Context) (*schemas.UserGet, error)
	AddContact(username string, contactAdd models.ContactAdd, ctx context.Context) (*models.ContactChat, error)
	ServiceGetContacts(username string, ctx context.Context) (*[]models.ContactChat, error)
	ServicesGetUserByTelephon(telephon string, ctx context.Context) (*schemas.UserGet, error)
	ServicePutUserByTelephon(telephon string, usernameUpdate string, ctx context.Context) (*schemas.UserGet, string, error)
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
	AddContact(contact models.ContactDataBase, ctx context.Context) error
	GetContactNumber(number string, ctx context.Context) (*models.ContactChat, error)
	GetContactsNumber(userID uint, ctx context.Context) (*[]models.ContactChat, error)
	GetUsernameByTelephon(telephon string, ctx context.Context) (string, error)
	GetIdByTelephon(telephon string, ctx context.Context) (int, error)
	PutContactByTelephon(userID uint, contactID uint, contactName string, ctx context.Context) error
}

type ServiceApiContact struct {
	client ContactRepoInterface
}

// InitServiceContact crea el servicio de contactos con su repositorio, devolviendo la interfaz ContactServicer.
func InitServiceContact(cliente ContactRepoInterface) ContactServicer {
	return &ServiceApiContact{
		client: cliente,
	}
}

// GetTelephonByUsername helper para obtener el telephon de un username
// GetTelephonByUsername obtiene el número de teléfono de un usuario por su username.
func (sr *ServiceApiContact) GetTelephonByUsername(username string, ctx context.Context) (string, error) {
	return sr.client.GetTelephonByUsername(username, ctx)
}

// ServicesGetUser obtiene los datos de perfil del usuario por username.
func (sr *ServiceApiContact) ServicesGetUser(username string, ctx context.Context) (*schemas.UserGet, error) {
	user, err := sr.client.GetUserDataBase(username, ctx)
	return user, err
}

// ServicePutUser actualiza el username de un usuario (buscado por username actual).
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

// AddContact agrega un contacto buscando al usuario por username.
func (sr *ServiceApiContact) AddContact(username string, contactAdd models.ContactAdd, ctx context.Context) (*models.ContactChat, error) {
	// Obtener ID del usuario que agrega
	id_user, err := sr.client.GetIdUsername(username, ctx)
	if err != nil {
		return nil, err
	}

	// Obtener ID del contacto por número
	id_contact, err := sr.client.GetNumberUsername(contactAdd.Number, ctx)
	if err != nil {
		return nil, err
	}

	// Evitar que el usuario se agregue a sí mismo
	if id_user == id_contact {
		return nil, errors.New("no puedes agregarte a ti mismo como contacto")
	}

	// Verificar si el contacto ya existe
	exist, err := sr.client.ExistContactAdd(uint(id_user), uint(id_contact), ctx)
	if err != nil {
		return nil, errors.New("error al verificar contacto")
	}
	if exist {
		return nil, errors.New("contacto ya existente")
	}

	// Crear el contacto solo para el usuario que lo agrega (unidireccional)
	contact := models.ContactDataBase{
		IdUser:      uint(id_user),
		IdContact:   uint(id_contact),
		Status:      "accepted", // Directamente aceptado, no hay pending
		ContactName: contactAdd.ContactName,
	}

	// Guardar en la base de datos
	if err := sr.client.AddContact(contact, ctx); err != nil {
		return nil, errors.New("error al registrar contacto")
	}

	// Obtener información del contacto agregado
	contactChat, err := sr.client.GetContactNumber(contactAdd.Number, ctx)
	if err != nil {
		return nil, err
	}

	// Establecer el nombre personalizado
	contactChat.ContactName = contactAdd.ContactName
	contactChat.Status = "accepted"

	return contactChat, nil
}

// ServiceGetContacts obtiene los contactos del usuario buscando por username.
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

// ==================== Métodos basados en Telephon ====================

// ServicesGetUserByTelephon obtiene los datos de un usuario buscando por telephon
// ServicesGetUserByTelephon obtiene los datos de perfil del usuario buscando por número de teléfono.
func (sr *ServiceApiContact) ServicesGetUserByTelephon(telephon string, ctx context.Context) (*schemas.UserGet, error) {
	user, err := sr.client.GetUserDataBaseByTelephon(telephon, ctx)
	return user, err
}

// ServicePutUserByTelephon actualiza el username de un usuario buscándolo por telephon.
// Retorna los datos del usuario actualizado y el username anterior.
// ServicePutUserByTelephon actualiza el username de un usuario buscado por su telephon
// y devuelve los datos actualizados junto con el username anterior.
func (sr *ServiceApiContact) ServicePutUserByTelephon(telephon string, usernameUpdate string, ctx context.Context) (*schemas.UserGet, string, error) {
	// Obtener el username actual para validar y para notificar
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

// AddContactByTelephon agrega un contacto usando el telephon del usuario autenticado
// AddContactByTelephon agrega un contacto usando el telephon del usuario (flujo WebSocket).
func (sr *ServiceApiContact) AddContactByTelephon(telephon string, contactAdd models.ContactAdd, ctx context.Context) (*models.ContactChat, error) {
	// Obtener ID del usuario que agrega por telephon
	id_user, err := sr.client.GetIdByTelephon(telephon, ctx)
	if err != nil {
		return nil, err
	}

	// Obtener ID del contacto por número
	id_contact, err := sr.client.GetNumberUsername(contactAdd.Number, ctx)
	if err != nil {
		return nil, err
	}

	// Evitar que el usuario se agregue a sí mismo
	if id_user == id_contact {
		return nil, errors.New("no puedes agregarte a ti mismo como contacto")
	}

	// Verificar si el contacto ya existe
	exist, err := sr.client.ExistContactAdd(uint(id_user), uint(id_contact), ctx)
	if err != nil {
		return nil, errors.New("error al verificar contacto")
	}
	if exist {
		return nil, errors.New("contacto ya existente")
	}

	// Crear el contacto solo para el usuario que lo agrega (unidireccional)
	contact := models.ContactDataBase{
		IdUser:      uint(id_user),
		IdContact:   uint(id_contact),
		Status:      "accepted",
		ContactName: contactAdd.ContactName,
	}

	// Guardar en la base de datos
	if err := sr.client.AddContact(contact, ctx); err != nil {
		return nil, errors.New("error al registrar contacto")
	}

	// Obtener información del contacto agregado
	contactChat, err := sr.client.GetContactNumber(contactAdd.Number, ctx)
	if err != nil {
		return nil, err
	}

	// Establecer el nombre personalizado
	contactChat.ContactName = contactAdd.ContactName
	contactChat.Status = "accepted"

	return contactChat, nil
}

// ServiceGetContactsByTelephon obtiene los contactos del usuario usando su telephon
// ServiceGetContactsByTelephon obtiene la lista de contactos del usuario buscando por telephon.
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

// ServicePutContactByTelephon actualiza el nombre personalizado de un contacto del usuario.
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
	// Verificar si el contacto existe
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
	contactChat, err := sr.client.GetContactNumber(contact.GetContactPut.Number, ctx)
	if err != nil {
		return nil, errors.New("error al obtener contacto actualizado")
	}
	contactChat.ContactName = contact.GetContactPut.ContactName
	contactChat.Status = "accepted"
	return contactChat, nil
}

// ServiceUpdateAvatar actualiza la URL del avatar del usuario identificado por su telephon
func (sr *ServiceApiContact) ServiceUpdateAvatar(telephon string, avatarUrl string, ctx context.Context) error {
	return sr.client.UpdateAvatarByTelephon(telephon, avatarUrl, ctx)
}

// ServiceUpdateWallpaper actualiza el fondo de pantalla global del usuario
func (sr *ServiceApiContact) ServiceUpdateWallpaper(telephon string, wallpaperUrl string, ctx context.Context) error {
	return sr.client.UpdateWallpaperByTelephon(telephon, wallpaperUrl, ctx)
}

// ServiceUpdateContactWallpaper actualiza el fondo de pantalla de un chat específico
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
