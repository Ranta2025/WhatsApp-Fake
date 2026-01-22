package services

import (
	"context"
	"errors"
	"gorm/cache"
	"gorm/models"
	"gorm/repos"
	"gorm/utils"
)

type ServicesUser struct {
	repo *repos.RepositoriesUser
	cache *cache.CacheUser
}

func InitServices(repo *repos.RepositoriesUser, cache *cache.CacheUser) *ServicesUser{
	return &ServicesUser{
		repo: repo,
		cache: cache,
	}
}

func (s *ServicesUser) CreateUser(user models.UserDataBase, ctx context.Context) error {
	if exist := s.repo.UsernameExist(user.Username, ctx); !exist {
		return errors.New("Username existente")
	}
	if _,exist := s.repo.EmailExist(user.Gmail, ctx); !exist {
		return errors.New("Gmail existente")
	}
	hash_password, err := utils.Hash(user.Password)
	if err != nil {
		return errors.New("Error al crear usuario")
	}
	user.Password = hash_password

	err = s.repo.CreateUser(user, ctx)
	if err != nil {
		return errors.New("error al crear usuario")
	}
	return nil
}

func (s *ServicesUser) LogIn(user models.UserLogin, ctx context.Context) (string, error) {
	exist, err := s.cache.CacheUserExist(user.Username, ctx)
	if err != nil{
		return "", err
	}
	if !exist {
		return "", errors.New("Usuario inexistente")
	}
	password, err := s.cache.CachePassword(user.Username, ctx)
	if err != nil {
		return "", err
	}
	if !utils.ComparePassword(user.Password, password){
		return "", errors.New("Contrasena incorrecta")
	} 
	token, err := utils.GenerateToken(user.Username)
	if err != nil {
		return "", err
	}
	return token, nil
}