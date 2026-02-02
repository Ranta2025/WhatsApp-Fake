package services

import (
	"context"
	"gorm/backend/models"
	"gorm/backend/repos"
	"gorm/backend/schemas"
	"time"
)

type ServiceChat struct {
	repo *repos.ApiContact
}

func InitServiceMessage(repo *repos.ApiContact) *ServiceChat {
	return &ServiceChat{
		repo: repo,
	}
}

func (rp *ServiceChat) ServiceCreatMessage(message models.MessageCreat, ctx context.Context) (schemas.Message, error) {
	id_user, err := rp.repo.GetIdUsername(message.Username, ctx)
	if err != nil {
		return schemas.Message{}, err
	}
	id_receptor, err := rp.repo.GetIdUsername(message.MessageGet.Receptor, ctx)
	if err != nil {
		return schemas.Message{}, err
	}
	messageDB := models.Message{
		IdUser:     uint(id_user),
		IdReceptor: uint(id_receptor),
		Message:    message.Message,
		Status:     "enviado",
		Time:       time.Now(),
	}

	err = rp.repo.CreateMessage(messageDB, ctx)
	if err != nil {
		return schemas.Message{}, err
	}
	return schemas.Message{
		MessageID: messageDB.ID,
		Username:  message.Username,
		Receptor:  message.MessageGet.Receptor,
		Message:   message.Message,
		Status:    "enviado",
		Time:      messageDB.Time,
	}, nil
}

func (rp *ServiceChat) ServiceGetMessages(username string, contact string, ctx context.Context) ([]schemas.Message, error) {
	id_user, err := rp.repo.GetIdUsername(username, ctx)
	if err != nil {
		return nil, err
	}
	id_contact, err := rp.repo.GetIdUsername(contact, ctx)
	if err != nil {
		return nil, err
	}
	messagesDB, err := rp.repo.GetMessages(uint(id_user), uint(id_contact), ctx)
	if err != nil {
		return nil, err
	}
	messagesSchemas := convertMessagesToSchemas(messagesDB, username, contact, id_user)
	return messagesSchemas, nil
}

func convertMessagesToSchemas(messagesDB []models.Message, username string, contact string, id_user int) []schemas.Message {
	var messages []schemas.Message
	for _, msg := range messagesDB {
		message := schemas.Message{
			MessageID: msg.ID,
			Username:  "",
			Receptor:  "",
			Message:   msg.Message,
			Status:    msg.Status,
			Time:      msg.Time,
		}
		if msg.IdUser == uint(id_user) {
			message.Username = username
			message.Receptor = contact
		} else {
			message.Username = contact
			message.Receptor = username
		}
		messages = append(messages, message)
	}
	return messages
}

func (rp *ServiceChat) ServicePutMessageStatusDelivered(username string, contact string, ctx context.Context) error {
	id_user, err := rp.repo.GetIdUsername(username, ctx)
	if err != nil {
		return err
	}
	id_contact, err := rp.repo.GetIdUsername(contact, ctx)
	if err != nil {
		return err
	}

	return rp.repo.PutStatusMessageSeenByContact(uint(id_contact), uint(id_user), ctx)
}

func (rp *ServiceChat) ServicePutAllMessageStatusDelivered(username string, ctx context.Context) error {
	id_user, err := rp.repo.GetIdUsername(username, ctx)
	if err != nil {
		return err
	}
	return rp.repo.PutStatusMessageDelivered(uint(id_user), ctx)
}
