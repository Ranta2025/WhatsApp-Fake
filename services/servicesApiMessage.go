package services

import "gorm/repos"

type ServiceApiMessage struct {
	client *repos.ApiMessage
}

func InitServiceApiMessage(cliente *repos.ApiMessage) *ServiceApiMessage {
	return &ServiceApiMessage{
		client: cliente,
	}
}