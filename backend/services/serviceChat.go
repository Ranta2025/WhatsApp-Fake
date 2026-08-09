package services

import (
	"context"
	"fmt"
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
	GetUserByIDs(ids []uint, ctx context.Context) (map[uint]*models.UserDataBase, error)
	UpdateMessageContent(messageID uint, senderID uint, newContent string, ctx context.Context) error
	DeleteMessageForSender(messageID uint, senderID uint, ctx context.Context) (*models.Message, error)
	ClearChatForUser(userID uint, contactID uint, ctx context.Context) error
}

type ServiceChat struct {
	repo ChatRepoInterface
}

func InitServiceMessage(repo ChatRepoInterface) ChatServicer {
	return &ServiceChat{
		repo: repo,
	}
}

func (rp *ServiceChat) ServiceCreatMessage(message models.MessageCreat, ctx context.Context) (schemas.Message, error) {
	return rp.ServiceCreatMessageWithStatus(message, "enviado", ctx)
}

func (rp *ServiceChat) ServiceCreatMessageWithStatus(message models.MessageCreat, status string, ctx context.Context) (schemas.Message, error) {
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
		SentAt:     time.Now(),

		MediaUrl:  message.MessageGet.MediaUrl,
		MediaType: message.MessageGet.MediaType,

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

	return schemas.Message{
		MessageID:      messageDB.ID,
		SenderTelephon: message.Telephon,
		Receptor:       message.MessageGet.Receptor,
		Message:        message.Message,
		Status:         status,
		Time:           messageDB.SentAt,

		MediaUrl:  messageDB.MediaUrl,
		MediaType: messageDB.MediaType,

		ReplyToMessageID: messageDB.ReplyToMessageID,
		ReplyToTelephon:  messageDB.ReplyToTelephon,
		ReplyToMessage:   messageDB.ReplyToMessage,
	}, nil
}

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

func convertMessagesToSchemas(messagesDB []models.Message, telephonUser string, telephonContact string, id_user int) []schemas.Message {
	var messages []schemas.Message
	for _, msg := range messagesDB {
		message := schemas.Message{
			MessageID:        msg.ID,
			SenderTelephon:   "",
			Receptor:         "",
			Message:          msg.Message,
			Status:           msg.Status,
			Time:             msg.SentAt,
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

func (rp *ServiceChat) ServicePutAllMessageStatusDelivered(telephon string, ctx context.Context) error {
	id_user, err := rp.repo.GetIdByTelephon(telephon, ctx)
	if err != nil {
		return err
	}
	return rp.repo.PutStatusMessageDelivered(uint(id_user), ctx)
}

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

func (rp *ServiceChat) ServiceGetAllChats(telephonUser string, ctx context.Context) ([]schemas.ChatGroup, error) {
	id_user, err := rp.repo.GetIdByTelephon(telephonUser, ctx)
	if err != nil {
		return nil, err
	}

	allMessages, err := rp.repo.GetAllMessagesForUser(uint(id_user), ctx)
	if err != nil {
		return nil, err
	}

	addedContacts, err := rp.repo.GetAddedContactIDs(uint(id_user), ctx)
	if err != nil {
		return nil, err
	}

	type groupKey = uint
	groupMessages := make(map[groupKey][]models.Message)
	otherIDsSet := make(map[groupKey]struct{})
	for _, msg := range allMessages {
		var otherID uint
		if msg.IdUser == uint(id_user) {
			otherID = msg.IdReceptor
		} else {
			otherID = msg.IdUser
		}
		groupMessages[otherID] = append(groupMessages[otherID], msg)
		otherIDsSet[otherID] = struct{}{}
	}

	otherIDList := make([]uint, 0, len(otherIDsSet))
	for oid := range otherIDsSet {
		otherIDList = append(otherIDList, oid)
	}

	usersMap, err := rp.repo.GetUserByIDs(otherIDList, ctx)
	if err != nil {
		return nil, fmt.Errorf("error obteniendo usuarios en batch: %w", err)
	}

	var result []schemas.ChatGroup
	for otherID, msgs := range groupMessages {
		otherUser, ok := usersMap[otherID]
		if !ok {
			continue
		}

		contactName, isContact := addedContacts[otherID]

		var schemaMsgs []schemas.Message
		for _, msg := range msgs {
			sm := schemas.Message{
				MessageID:        msg.ID,
				Message:          msg.Message,
				Status:           msg.Status,
				Time:             msg.SentAt,
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

func (rp *ServiceChat) ServiceEditMessage(telephonSender string, messageID uint, newContent string, ctx context.Context) (schemas.Message, error) {
	idSender, err := rp.repo.GetIdByTelephon(telephonSender, ctx)
	if err != nil {
		return schemas.Message{}, err
	}

	err = rp.repo.UpdateMessageContent(messageID, uint(idSender), newContent, ctx)
	if err != nil {
		return schemas.Message{}, err
	}

	msgDB, err := rp.repo.GetMessageByID(messageID, ctx)
	if err != nil {
		return schemas.Message{}, err
	}

	senderTelephon := telephonSender
	var receptorTelephon string

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
		Time:           msgDB.SentAt,
		Edited:         msgDB.Edited,

		ReplyToMessageID: msgDB.ReplyToMessageID,
		ReplyToTelephon:  msgDB.ReplyToTelephon,
		ReplyToMessage:   msgDB.ReplyToMessage,
	}, nil
}

func (rp *ServiceChat) ServiceDeleteMessage(telephonSender string, messageID uint, ctx context.Context) (schemas.Message, error) {
	idSender, err := rp.repo.GetIdByTelephon(telephonSender, ctx)
	if err != nil {
		return schemas.Message{}, err
	}
	msgDB, err := rp.repo.DeleteMessageForSender(messageID, uint(idSender), ctx)
	if err != nil {
		return schemas.Message{}, err
	}
	receptorTelephon, err := rp.repo.GetTelephonByID(msgDB.IdReceptor, ctx)
	if err != nil {
		return schemas.Message{}, err
	}
	return schemas.Message{
		MessageID:        msgDB.ID,
		SenderTelephon:   telephonSender,
		Receptor:         receptorTelephon,
		Message:          msgDB.Message,
		Status:           msgDB.Status,
		Time:             msgDB.SentAt,
		Edited:           msgDB.Edited,
		ReplyToMessageID: msgDB.ReplyToMessageID,
		ReplyToTelephon:  msgDB.ReplyToTelephon,
		ReplyToMessage:   msgDB.ReplyToMessage,
	}, nil
}

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

func (rp *ServiceChat) ServiceDeleteMessageForMe(telephonUser string, messageID uint, ctx context.Context) (schemas.Message, error) {
	idUser, err := rp.repo.GetIdByTelephon(telephonUser, ctx)
	if err != nil {
		return schemas.Message{}, err
	}
	msgDB, err := rp.repo.DeleteMessageForMe(messageID, uint(idUser), ctx)
	if err != nil {
		return schemas.Message{}, err
	}

	var senderTelephon, receptorTelephon string
	if msgDB.IdUser == uint(idUser) {
		senderTelephon = telephonUser
		receptorTelephon, err = rp.repo.GetTelephonByID(msgDB.IdReceptor, ctx)
		if err != nil {
			return schemas.Message{}, err
		}
	} else {
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
		Time:             msgDB.SentAt,
		Edited:           msgDB.Edited,
		ReplyToMessageID: msgDB.ReplyToMessageID,
		ReplyToTelephon:  msgDB.ReplyToTelephon,
		ReplyToMessage:   msgDB.ReplyToMessage,
	}, nil
}
