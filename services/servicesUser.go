package services

import (
	"errors"
	"gorm/models"
	"gorm/repos"
	"gorm/utils"
)

type ServicesUser struct {
	repo *repos.RepositoriesUser
}

func InitServices(repo *repos.RepositoriesUser) *ServicesUser{
	return &ServicesUser{repo: repo}
}

func (s *ServicesUser) CreateUser(user models.UserDataBase) error {
	if _,exist := s.repo.UsernameExist(user.Username); exist {
		return errors.New("Username existente")
	}
	if _,exist := s.repo.EmailExist(user.Gmail); exist {
		return errors.New("Gmail existente")
	}
	hash_password, err := utils.Hash(user.Password)
	if err != nil {
		return errors.New("Error al crear usuario")
	}
	user.Password = hash_password

	err = s.repo.CreateUser(user)
	if err != nil {
		return errors.New("error al crear usuario")
	}
	return nil
}

func (s *ServicesUser) LogIn(user models.UserLogin) (string, error) {
	userData, exist := s.repo.UsernameExist(user.Username)
	if !exist {
		return "", errors.New("Usuario inexistente")
	}

	if !utils.ComparePassword(user.Password, userData.Password){
		return "", errors.New("Contrasena incorrecta")
	} 
	token, err := utils.GenerateToken(user.Username)
	if err != nil {
		return "", err
	}
	return token, nil
}