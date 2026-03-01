package services

import (
	"context"
	"gorm/backend/models"
	"gorm/backend/schemas"
	"log"
	"time"
)

type ChatServicer interface {
	ServiceCreatMessage(message models.MessageCreat, ctx context.Context) (schemas.Message, error)
	ServiceCreatMessageWithStatus(message models.MessageCreat, status string, ctx context.Context) (schemas.Message, error)
	ServiceGetMessages(telephonUser string, telephonContact string, ctx context.Context) ([]schemas.Message, error)
	ServicePutMessageStatusDelivered(telephonSender string, telephonReceiver string, ctx context.Context) error
	ServicePutAllMessageStatusDelivered(telephon string, ctx context.Context) error
	ServiceGetSendersAndMarkDelivered(telephon string, ctx context.Context) ([]string, error)
	ServiceGetAllChats(telephonUser string, ctx context.Context) ([]schemas.ChatGroup, error)
	ServiceEditMessage(telephonSender string, messageID uint, newContent string, ctx context.Context) (schemas.Message, error)
	ServiceDeleteMessage(telephonSender string, messageID uint, ctx context.Context) (schemas.Message, error)
	ServiceClearChat(telephonUser string, telephonContact string, ctx context.Context) error
	ServiceDeleteMessageForMe(telephonUser string, messageID uint, ctx context.Context) (schemas.Message, error)
}

type ChatRepoInterface interface {
	GetIdByTelephon(telephon string, ctx context.Context) (int, error)
	CreateMessage(msg *models.Message, ctx context.Context) error
	GetMessages(id1, id2 uint, ctx context.Context) ([]models.Message, error)
	GetTelephonByID(id uint, ctx context.Context) (string, error)
	PutStatusMessageSeenByContact(senderID, receiverID uint, ctx context.Context) error
	PutStatusMessageDelivered(userID uint, ctx context.Context) error
	GetSenderTelephonsWithPendingMessages(receiverID uint, ctx context.Context) ([]string, error)
	GetAllMessagesForUser(userID uint, ctx context.Context) ([]models.Message, error)
	GetAddedContactIDs(userID uint, ctx context.Context) (map[uint]string, error)
	GetUserDataBaseByTelephon(telephon string, ctx context.Context) (*schemas.UserGet, error)
	GetMessageByID(messageID uint, ctx context.Context) (*models.Message, error)
	DeleteMessageForMe(messageID uint, userID uint, ctx context.Context) (*models.Message, error)
	GetUserByID(userID uint, ctx context.Context) (*models.UserDataBase, error)
	UpdateMessageContent(messageID uint, senderID uint, newContent string, ctx context.Context) error
	DeleteMessageForSender(messageID uint, senderID uint, ctx context.Context) (*models.Message, error)
	ClearChatForUser(userID uint, contactID uint, ctx context.Context) error
}

type ServiceChat struct {
	repo ChatRepoInterface
}

// InitServiceMessage crea el servicio de chat con su repositorio, devolviendo la interfaz ChatServicer.
func InitServiceMessage(repo ChatRepoInterface) ChatServicer {
	return &ServiceChat{
		repo: repo,
	}
}

// ServiceCreatMessage persiste un nuevo mensaje con estado 'enviado'.
func (rp *ServiceChat) ServiceCreatMessage(message models.MessageCreat, ctx context.Context) (schemas.Message, error) {
	return rp.ServiceCreatMessageWithStatus(message, "enviado", ctx)
}

// ServiceCreatMessageWithStatus persiste un nuevo mensaje con el estado indicado
// y resuelve los IDs internos a partir de los telephons.
func (rp *ServiceChat) ServiceCreatMessageWithStatus(message models.MessageCreat, status string, ctx context.Context) (schemas.Message, error) {
	// message.Telephon contiene el telephon del remitente
	// message.MessageGet.Receptor contiene el telephon del receptor
	id_user, err := rp.repo.GetIdByTelephon(message.Telephon, ctx)
	if err != nil {
		return schemas.Message{}, err
	}
	id_receptor, err := rp.repo.GetIdByTelephon(message.MessageGet.Receptor, ctx)
	if err != nil {
		return schemas.Message{}, err
	}
	messageDB := models.Message{
		IdUser:     uint(id_user),
		IdReceptor: uint(id_receptor),
		Message:    message.Message,
		Status:     status,
		Time:       time.Now(),

		// Campos de media
		MediaUrl:  message.MessageGet.MediaUrl,
		MediaType: message.MessageGet.MediaType,

		// Campos de reply
		ReplyToMessageID: message.MessageGet.ReplyToMessageID,
		ReplyToTelephon:  message.MessageGet.ReplyToTelephon,
		ReplyToMessage:   message.MessageGet.ReplyToMessage,
	}

	err = rp.repo.CreateMessage(&messageDB, ctx)
	if err != nil {
		return schemas.Message{}, err
	}

	log.Printf("[SERVICE] Mensaje guardado en BD. ID generado: %d", messageDB.ID)
	log.Printf("[SERVICE] messageDB completo: %+v", messageDB)

	// Devolver el schema con telephons
	return schemas.Message{
		MessageID:      messageDB.ID,
		SenderTelephon: message.Telephon,            // número de teléfono del remitente
		Receptor:       message.MessageGet.Receptor, // número de teléfono del receptor
		Message:        message.Message,
		Status:         status,
		Time:           messageDB.Time,

		// Campos de media
		MediaUrl:  messageDB.MediaUrl,
		MediaType: messageDB.MediaType,

		// Campos de reply
		ReplyToMessageID: messageDB.ReplyToMessageID,
		ReplyToTelephon:  messageDB.ReplyToTelephon,
		ReplyToMessage:   messageDB.ReplyToMessage,
	}, nil
}

// ServiceGetMessages devuelve los mensajes entre dos usuarios (por telephon)
// excluyendo los eliminados por cada parte.
func (rp *ServiceChat) ServiceGetMessages(telephonUser string, telephonContact string, ctx context.Context) ([]schemas.Message, error) {
	id_user, err := rp.repo.GetIdByTelephon(telephonUser, ctx)
	if err != nil {
		return nil, err
	}
	id_contact, err := rp.repo.GetIdByTelephon(telephonContact, ctx)
	if err != nil {
		return nil, err
	}
	messagesDB, err := rp.repo.GetMessages(uint(id_user), uint(id_contact), ctx)
	if err != nil {
		return nil, err
	}
	messagesSchemas := convertMessagesToSchemas(messagesDB, telephonUser, telephonContact, id_user)
	return messagesSchemas, nil
}

// convertMessagesToSchemas transforma una lista de modelos Message en schemas,
// asignando los telephons correctos a remitente y receptor.
func convertMessagesToSchemas(messagesDB []models.Message, telephonUser string, telephonContact string, id_user int) []schemas.Message {
	var messages []schemas.Message
	for _, msg := range messagesDB {
		message := schemas.Message{
			MessageID:        msg.ID,
			SenderTelephon:   "",
			Receptor:         "",
			Message:          msg.Message,
			Status:           msg.Status,
			Time:             msg.Time,
			ReplyToMessageID: msg.ReplyToMessageID,
			ReplyToTelephon:  msg.ReplyToTelephon,
			ReplyToMessage:   msg.ReplyToMessage,
			Edited:           msg.Edited,
			MediaUrl:         msg.MediaUrl,
			MediaType:        msg.MediaType,
		}
		if msg.IdUser == uint(id_user) {
			message.SenderTelephon = telephonUser
			message.Receptor = telephonContact
		} else {
			message.SenderTelephon = telephonContact
			message.Receptor = telephonUser
		}
		messages = append(messages, message)
	}
	return messages
}

// ServicePutMessageStatusDelivered marca como 'visto' todos los mensajes enviados
// por telephonSender al telephonReceiver que estén en estado 'entregado'.
func (rp *ServiceChat) ServicePutMessageStatusDelivered(telephonSender string, telephonReceiver string, ctx context.Context) error {
	id_sender, err := rp.repo.GetIdByTelephon(telephonSender, ctx)
	if err != nil {
		return err
	}
	id_receiver, err := rp.repo.GetIdByTelephon(telephonReceiver, ctx)
	if err != nil {
		return err
	}

	return rp.repo.PutStatusMessageSeenByContact(uint(id_sender), uint(id_receiver), ctx)
}

// ServicePutAllMessageStatusDelivered marca como 'entregado' todos los mensajes
// pendientes del usuario (usado al reconectarse).
func (rp *ServiceChat) ServicePutAllMessageStatusDelivered(telephon string, ctx context.Context) error {
	id_user, err := rp.repo.GetIdByTelephon(telephon, ctx)
	if err != nil {
		return err
	}
	return rp.repo.PutStatusMessageDelivered(uint(id_user), ctx)
}

// ServiceGetSendersAndMarkDelivered marca como "entregado" todos los mensajes pendientes
// del usuario y retorna los telephons de los remitentes afectados para notificarles.
func (rp *ServiceChat) ServiceGetSendersAndMarkDelivered(telephon string, ctx context.Context) ([]string, error) {
	id_user, err := rp.repo.GetIdByTelephon(telephon, ctx)
	if err != nil {
		return nil, err
	}
	senders, err := rp.repo.GetSenderTelephonsWithPendingMessages(uint(id_user), ctx)
	if err != nil {
		return nil, err
	}
	if len(senders) == 0 {
		return nil, nil
	}
	if err := rp.repo.PutStatusMessageDelivered(uint(id_user), ctx); err != nil {
		return nil, err
	}
	return senders, nil
}

// ServiceGetAllChats devuelve todos los chats del usuario agrupados por contacto.
// Cada grupo incluye IsContact=true si el otro participante está en la lista de
// contactos del usuario, o false si le escribió sin estar agregado.
// ServiceGetAllChats devuelve todos los chats del usuario agrupados por contacto,
// con el último mensaje y contador de no leídos de cada conversación.
func (rp *ServiceChat) ServiceGetAllChats(telephonUser string, ctx context.Context) ([]schemas.ChatGroup, error) {
	id_user, err := rp.repo.GetIdByTelephon(telephonUser, ctx)
	if err != nil {
		return nil, err
	}

	// Todos los mensajes donde participa el usuario
	allMessages, err := rp.repo.GetAllMessagesForUser(uint(id_user), ctx)
	if err != nil {
		return nil, err
	}

	// IDs de contactos agregados y sus nombres personalizados
	addedContacts, err := rp.repo.GetAddedContactIDs(uint(id_user), ctx)
	if err != nil {
		return nil, err
	}

	// Agrupar por el ID del otro participante
	type groupKey = uint
	groupMessages := make(map[groupKey][]models.Message)
	otherIDs := make(map[groupKey]struct{})
	for _, msg := range allMessages {
		var otherID uint
		if msg.IdUser == uint(id_user) {
			otherID = msg.IdReceptor
		} else {
			otherID = msg.IdUser
		}
		groupMessages[otherID] = append(groupMessages[otherID], msg)
		otherIDs[otherID] = struct{}{}
	}

	var result []schemas.ChatGroup
	for otherID, msgs := range groupMessages {
		// Obtener datos del otro usuario (telefono y username)
		otherUser, err := rp.repo.GetUserByID(otherID, ctx)
		if err != nil {
			continue
		}

		contactName, isContact := addedContacts[otherID]

		// Convertir mensajes al schema
		var schemaMsgs []schemas.Message
		for _, msg := range msgs {
			sm := schemas.Message{
				MessageID:        msg.ID,
				Message:          msg.Message,
				Status:           msg.Status,
				Time:             msg.Time,
				ReplyToMessageID: msg.ReplyToMessageID,
				ReplyToTelephon:  msg.ReplyToTelephon,
				ReplyToMessage:   msg.ReplyToMessage,
				Edited:           msg.Edited,
				MediaUrl:         msg.MediaUrl,
				MediaType:        msg.MediaType,
			}
			if msg.IdUser == uint(id_user) {
				sm.SenderTelephon = telephonUser
				sm.Receptor = otherUser.Telephon
			} else {
				sm.SenderTelephon = otherUser.Telephon
				sm.Receptor = telephonUser
			}
			schemaMsgs = append(schemaMsgs, sm)
		}

		result = append(result, schemas.ChatGroup{
			ContactTelephon:  otherUser.Telephon,
			ContactUsername:  otherUser.Username,
			ContactName:      contactName,
			ContactAvatarUrl: otherUser.AvatarUrl,
			IsContact:        isContact,
			Messages:         schemaMsgs,
		})
	}

	return result, nil
}

// ServiceEditMessage edita el contenido de un mensaje existente.
// Solo el remitente original puede editar el mensaje.
// Retorna el mensaje actualizado como schema.
func (rp *ServiceChat) ServiceEditMessage(telephonSender string, messageID uint, newContent string, ctx context.Context) (schemas.Message, error) {
	// Obtener ID del remitente
	idSender, err := rp.repo.GetIdByTelephon(telephonSender, ctx)
	if err != nil {
		return schemas.Message{}, err
	}

	// Actualizar en BD
	err = rp.repo.UpdateMessageContent(messageID, uint(idSender), newContent, ctx)
	if err != nil {
		return schemas.Message{}, err
	}

	// Obtener el mensaje actualizado para devolver datos completos
	msgDB, err := rp.repo.GetMessageByID(messageID, ctx)
	if err != nil {
		return schemas.Message{}, err
	}

	// Resolver telephons
	senderTelephon := telephonSender
	var receptorTelephon string

	// Obtener el telephon del receptor
	receptorUser, err := rp.repo.GetUserByID(msgDB.IdReceptor, ctx)
	if err != nil {
		return schemas.Message{}, err
	}
	receptorTelephon = receptorUser.Telephon

	return schemas.Message{
		MessageID:      msgDB.ID,
		SenderTelephon: senderTelephon,
		Receptor:       receptorTelephon,
		Message:        msgDB.Message,
		Status:         msgDB.Status,
		Time:           msgDB.Time,
		Edited:         msgDB.Edited,

		ReplyToMessageID: msgDB.ReplyToMessageID,
		ReplyToTelephon:  msgDB.ReplyToTelephon,
		ReplyToMessage:   msgDB.ReplyToMessage,
	}, nil
}

// ServiceDeleteMessage elimina un mensaje para todos (marca deleted_by_sender y deleted_by_receiver).
// Solo el remitente puede eliminar el mensaje.
func (rp *ServiceChat) ServiceDeleteMessage(telephonSender string, messageID uint, ctx context.Context) (schemas.Message, error) {
	// Query 1: obtener ID del sender para verificar ownership
	idSender, err := rp.repo.GetIdByTelephon(telephonSender, ctx)
	if err != nil {
		return schemas.Message{}, err
	}
	// Query 2+3: First + Delete en el repo
	msgDB, err := rp.repo.DeleteMessageForSender(messageID, uint(idSender), ctx)
	if err != nil {
		return schemas.Message{}, err
	}
	// Query 4: solo el telephon del receptor (no toda la fila)
	receptorTelephon, err := rp.repo.GetTelephonByID(msgDB.IdReceptor, ctx)
	if err != nil {
		return schemas.Message{}, err
	}
	return schemas.Message{
		MessageID:        msgDB.ID,
		SenderTelephon:   telephonSender, // ya lo tenemos, sin query extra
		Receptor:         receptorTelephon,
		Message:          msgDB.Message,
		Status:           msgDB.Status,
		Time:             msgDB.Time,
		Edited:           msgDB.Edited,
		ReplyToMessageID: msgDB.ReplyToMessageID,
		ReplyToTelephon:  msgDB.ReplyToTelephon,
		ReplyToMessage:   msgDB.ReplyToMessage,
	}, nil
}

// ServiceClearChat vacía el chat para el usuario actual con el contacto especificado
// ServiceClearChat elimina el historial de mensajes entre dos usuarios solo para el solicitante.
func (rp *ServiceChat) ServiceClearChat(telephonUser string, telephonContact string, ctx context.Context) error {
	id_user, err := rp.repo.GetIdByTelephon(telephonUser, ctx)
	if err != nil {
		return err
	}
	id_contact, err := rp.repo.GetIdByTelephon(telephonContact, ctx)
	if err != nil {
		return err
	}
	return rp.repo.ClearChatForUser(uint(id_user), uint(id_contact), ctx)
}

// ServiceDeleteMessageForMe elimina un mensaje solo para el usuario actual
// ServiceDeleteMessageForMe elimina un mensaje únicamente del lado del usuario que lo solicita.
func (rp *ServiceChat) ServiceDeleteMessageForMe(telephonUser string, messageID uint, ctx context.Context) (schemas.Message, error) {
	// Query 1: obtener ID del usuario actual
	idUser, err := rp.repo.GetIdByTelephon(telephonUser, ctx)
	if err != nil {
		return schemas.Message{}, err
	}
	// Query 2+3: First + Update en el repo
	msgDB, err := rp.repo.DeleteMessageForMe(messageID, uint(idUser), ctx)
	if err != nil {
		return schemas.Message{}, err
	}

	// Ya tenemos telephonUser — determinamos si es sender o receptor
	// para evitar consultar ambos y solo buscar el que falta (Query 4 en vez de 4+5)
	var senderTelephon, receptorTelephon string
	if msgDB.IdUser == uint(idUser) {
		// El usuario actual es el emisor, telephon ya conocido
		senderTelephon = telephonUser
		receptorTelephon, err = rp.repo.GetTelephonByID(msgDB.IdReceptor, ctx)
		if err != nil {
			return schemas.Message{}, err
		}
	} else {
		// El usuario actual es el receptor, telephon ya conocido
		receptorTelephon = telephonUser
		senderTelephon, err = rp.repo.GetTelephonByID(msgDB.IdUser, ctx)
		if err != nil {
			return schemas.Message{}, err
		}
	}

	return schemas.Message{
		MessageID:        msgDB.ID,
		SenderTelephon:   senderTelephon,
		Receptor:         receptorTelephon,
		Message:          msgDB.Message,
		Status:           msgDB.Status,
		Time:             msgDB.Time,
		Edited:           msgDB.Edited,
		ReplyToMessageID: msgDB.ReplyToMessageID,
		ReplyToTelephon:  msgDB.ReplyToTelephon,
		ReplyToMessage:   msgDB.ReplyToMessage,
	}, nil
}
