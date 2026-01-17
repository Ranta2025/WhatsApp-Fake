package handlers

import (
	"fmt"
	"gorm/models"
	"gorm/services"
)

type HandlerUser struct {
	service *services.ServicesUser
}

func GetHandlerUser(service *services.ServicesUser) *HandlerUser {
	return &HandlerUser{service}
}

func (s *HandlerUser) HandlerLogOut(username string, gmail string, password string){
	user := models.UserDataBase{
		User: models.User{
			Username: username,
			Gmail: gmail,
		},
		Password: password,
	}
	err := s.service.CreateUser(user)
	if err != nil {
		fmt.Println(err.Error())
		return
	}
	fmt.Println("Usuario creado exitosamente")
}

func (s *HandlerUser) HandlerLogIn(username string, password string){
	user := models.UserLogin{
		Username: username,
		Password: password,
	}
	token, err := s.service.LogIn(user)
	if err != nil {
		fmt.Println(err)
		return
	}
	fmt.Printf("Token: %s", token)
}