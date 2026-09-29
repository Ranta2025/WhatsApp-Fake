package services

import (
	"context"
	"errors"
	"gorm/backend/models"
	"gorm/backend/schemas"
	"sort"
	"time"
)

// chatListMessagesPerChat es el número de mensajes recientes que se devuelven
// por conversación en el listado de chats (mismo límite que GetMessages).
const chatListMessagesPerChat = 200

// maxChatMessagesPage es el máximo de mensajes por página al paginar con cursor.
const maxChatMessagesPage = 100

type ChatServicer interface {
	ServiceCreatMessage(message models.MessageCreat, ctx context.Context) (schemas.Message, error)
	ServiceCreatMessageWithStatus(message models.MessageCreat, status string, ctx context.Context) (schemas.Message, error)
	ServiceGetMessages(telephonUser string, telephonContact string, ctx context.Context) ([]schemas.Message, error)
	ServiceGetMessagesPage(telephonUser string, telephonContact string, before uint, limit int, ctx context.Context) ([]schemas.Message, bool, error)
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
	GetMessagesPage(id1, id2, before uint, limit int, ctx context.Context) ([]models.Message, bool, error)
	GetTelephonByID(id uint, ctx context.Context) (string, error)
	PutStatusMessageSeenByContact(senderID, receiverID uint, ctx context.Context) error
	PutStatusMessageDelivered(userID uint, ctx context.Context) error
	GetSenderTelephonsWithPendingMessages(receiverID uint, ctx context.Context) ([]string, error)
	GetRecentMessagesForUser(userID uint, perChat int, ctx context.Context) ([]models.Message, error)
	GetAddedContactIDs(userID uint, ctx context.Context) (map[uint]string, error)
	GetMessageByID(messageID uint, ctx context.Context) (*models.Message, error)
	DeleteMessageForMe(messageID uint, userID uint, ctx context.Context) (*models.Message, error)
	GetUsersBasicByIDs(ids []uint, ctx context.Context) (map[uint]models.UserBasic, error)
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

// ServiceCreatMessageWithStatus valida y persiste un nuevo mensaje con el estado
// indicado, resolviendo los IDs internos a partir de los telephons.
func (rp *ServiceChat) ServiceCreatMessageWithStatus(message models.MessageCreat, status string, ctx context.Context) (schemas.Message, error) {
	if message.MessageGet.Receptor == "" {
		return schemas.Message{}, errors.New("el receptor no puede estar vacío")
	}
	content := messageContent{
		Message:         message.Message,
		MediaUrl:        message.MessageGet.MediaUrl,
		MediaType:       message.MessageGet.MediaType,
		ReplyToTelephon: message.MessageGet.ReplyToTelephon,
		ReplyToMessage:  message.MessageGet.ReplyToMessage,
	}
	if err := validateMessageContent(&content); err != nil {
		return schemas.Message{}, err
	}

	// message.Telephon contiene el telephon del remitente
	// message.MessageGet.Receptor contiene el telephon del receptor
	id_user, err := rp.repo.GetIdByTelephon(message.Telephon, ctx)
	if err != nil {
		return schemas.Message{}, err
	}
	id_receptor, err := rp.repo.GetIdByTelephon(message.MessageGet.Receptor, ctx)
	if err != nil {
		return schemas.Message{}, errors.New("el receptor no existe")
	}
	messageDB := models.Message{
		IdUser:     uint(id_user),
		IdReceptor: uint(id_receptor),
		Message:    content.Message,
		Status:     status,
		Time:       time.Now(),

		// Campos de media
		MediaUrl:  content.MediaUrl,
		MediaType: content.MediaType,

		// Campos de reply
		ReplyToMessageID: message.MessageGet.ReplyToMessageID,
		ReplyToTelephon:  content.ReplyToTelephon,
		ReplyToMessage:   content.ReplyToMessage,
	}

	if err := rp.repo.CreateMessage(&messageDB, ctx); err != nil {
		return schemas.Message{}, err
	}

	// Devolver el schema con telephons
	return messageToSchema(&messageDB, message.Telephon, message.MessageGet.Receptor), nil
}

// messageToSchema mapea un Message de BD al schema de la API con los telephons ya resueltos.
func messageToSchema(msg *models.Message, senderTelephon, receptorTelephon string) schemas.Message {
	return schemas.Message{
		MessageID:        msg.ID,
		SenderTelephon:   senderTelephon,
		Receptor:         receptorTelephon,
		Message:          msg.Message,
		Status:           msg.Status,
		Time:             msg.Time,
		Edited:           msg.Edited,
		MediaUrl:         msg.MediaUrl,
		MediaType:        msg.MediaType,
		ReplyToMessageID: msg.ReplyToMessageID,
		ReplyToTelephon:  msg.ReplyToTelephon,
		ReplyToMessage:   msg.ReplyToMessage,
	}
}

// ServiceGetMessages devuelve los mensajes entre dos usuarios (por telephon)
// excluyendo los eliminados por cada parte (últimos 200).
func (rp *ServiceChat) ServiceGetMessages(telephonUser string, telephonContact string, ctx context.Context) ([]schemas.Message, error) {
	messages, _, err := rp.ServiceGetMessagesPage(telephonUser, telephonContact, 0, 0, ctx)
	return messages, err
}

// ServiceGetMessagesPage devuelve una página de la conversación en orden
// cronológico. before > 0 activa el cursor por id (solo mensajes anteriores).
// limit <= 0 conserva el comportamiento histórico (últimos 200); un limit
// explícito se acota a maxChatMessagesPage. hasMore indica si quedan más antiguos.
func (rp *ServiceChat) ServiceGetMessagesPage(telephonUser string, telephonContact string, before uint, limit int, ctx context.Context) ([]schemas.Message, bool, error) {
	id_user, err := rp.repo.GetIdByTelephon(telephonUser, ctx)
	if err != nil {
		return nil, false, err
	}
	id_contact, err := rp.repo.GetIdByTelephon(telephonContact, ctx)
	if err != nil {
		return nil, false, err
	}
	if limit <= 0 {
		limit = chatListMessagesPerChat
	} else if limit > maxChatMessagesPage {
		limit = maxChatMessagesPage
	}
	messagesDB, hasMore, err := rp.repo.GetMessagesPage(uint(id_user), uint(id_contact), before, limit, ctx)
	if err != nil {
		return nil, false, err
	}
	return convertMessagesToSchemas(messagesDB, telephonUser, telephonContact, id_user), hasMore, nil
}

// convertMessagesToSchemas transforma una lista de modelos Message en schemas,
// asignando los telephons correctos a remitente y receptor.
func convertMessagesToSchemas(messagesDB []models.Message, telephonUser string, telephonContact string, id_user int) []schemas.Message {
	messages := make([]schemas.Message, 0, len(messagesDB))
	for i := range messagesDB {
		msg := &messagesDB[i]
		if msg.IdUser == uint(id_user) {
			messages = append(messages, messageToSchema(msg, telephonUser, telephonContact))
		} else {
			messages = append(messages, messageToSchema(msg, telephonContact, telephonUser))
		}
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

// ServiceGetAllChats devuelve todos los chats del usuario agrupados por contacto
// (los más recientes primero), con los últimos chatListMessagesPerChat mensajes
// de cada conversación. Cada grupo incluye IsContact=true si el otro participante
// está en la lista de contactos del usuario, o false si le escribió sin estar agregado.
func (rp *ServiceChat) ServiceGetAllChats(telephonUser string, ctx context.Context) ([]schemas.ChatGroup, error) {
	id_user, err := rp.repo.GetIdByTelephon(telephonUser, ctx)
	if err != nil {
		return nil, err
	}
	userID := uint(id_user)

	// Últimos mensajes de cada conversación del usuario (orden cronológico)
	recentMessages, err := rp.repo.GetRecentMessagesForUser(userID, chatListMessagesPerChat, ctx)
	if err != nil {
		return nil, err
	}

	// IDs de contactos agregados y sus nombres personalizados
	addedContacts, err := rp.repo.GetAddedContactIDs(userID, ctx)
	if err != nil {
		return nil, err
	}

	// Agrupar por el ID del otro participante conservando el orden cronológico
	groupMessages := make(map[uint][]models.Message)
	otherIDs := make([]uint, 0)
	for _, msg := range recentMessages {
		otherID := msg.IdUser
		if msg.IdUser == userID {
			otherID = msg.IdReceptor
		}
		if _, seen := groupMessages[otherID]; !seen {
			otherIDs = append(otherIDs, otherID)
		}
		groupMessages[otherID] = append(groupMessages[otherID], msg)
	}

	// Datos de todos los participantes en una sola consulta (antes: una por chat)
	users, err := rp.repo.GetUsersBasicByIDs(otherIDs, ctx)
	if err != nil {
		return nil, err
	}

	result := make([]schemas.ChatGroup, 0, len(otherIDs))
	for _, otherID := range otherIDs {
		otherUser, ok := users[otherID]
		if !ok {
			continue
		}
		contactName, isContact := addedContacts[otherID]
		result = append(result, schemas.ChatGroup{
			ContactTelephon:  otherUser.Telephon,
			ContactUsername:  otherUser.Username,
			ContactName:      contactName,
			ContactAvatarUrl: otherUser.AvatarUrl,
			IsContact:        isContact,
			Messages:         convertMessagesToSchemas(groupMessages[otherID], telephonUser, otherUser.Telephon, id_user),
		})
	}

	// Chats con actividad más reciente primero (antes el orden era aleatorio)
	sort.SliceStable(result, func(i, j int) bool {
		mi, mj := result[i].Messages, result[j].Messages
		return mi[len(mi)-1].Time.After(mj[len(mj)-1].Time)
	})

	return result, nil
}

// ServiceEditMessage edita el contenido de un mensaje existente.
// Solo el remitente original puede editar el mensaje.
// Retorna el mensaje actualizado como schema.
func (rp *ServiceChat) ServiceEditMessage(telephonSender string, messageID uint, newContent string, ctx context.Context) (schemas.Message, error) {
	if err := validateEditedContent(newContent); err != nil {
		return schemas.Message{}, err
	}

	// Obtener ID del remitente
	idSender, err := rp.repo.GetIdByTelephon(telephonSender, ctx)
	if err != nil {
		return schemas.Message{}, err
	}

	// Actualizar en BD (solo si el mensaje es del remitente)
	if err := rp.repo.UpdateMessageContent(messageID, uint(idSender), newContent, ctx); err != nil {
		return schemas.Message{}, err
	}

	// Obtener el mensaje actualizado para devolver datos completos
	msgDB, err := rp.repo.GetMessageByID(messageID, ctx)
	if err != nil {
		return schemas.Message{}, err
	}

	receptorTelephon, err := rp.repo.GetTelephonByID(msgDB.IdReceptor, ctx)
	if err != nil {
		return schemas.Message{}, err
	}

	return messageToSchema(msgDB, telephonSender, receptorTelephon), nil
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
	return messageToSchema(msgDB, telephonSender, receptorTelephon), nil
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

	return messageToSchema(msgDB, senderTelephon, receptorTelephon), nil
}
