package services

import (
	"context"
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