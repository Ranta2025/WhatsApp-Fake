package services

import (
	"context"
	"errors"
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
		return nil,errors.New("Proporciono el mismo usuario")
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