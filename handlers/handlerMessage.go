package handlers

import "gorm/services"

type HandlerApiMessage struct {
	service *services.ServiceApiMessage
}

func InitHandlerApiMessage(services *services.ServiceApiMessage) *HandlerApiMessage {
	return &HandlerApiMessage{
		service: services,
	}
}