package services

import (
	"context"
	"errors"
	"gorm/cache"
	"gorm/models"
	"gorm/repos"
	"gorm/utils"
	"log"
)

type ServicesUser struct {
	repo  *repos.RepositoriesUser
	cache *cache.CacheUser
}

func InitServices(repo *repos.RepositoriesUser, cache *cache.CacheUser) *ServicesUser {
	return &ServicesUser{
		repo:  repo,
		cache: cache,
	}
}

func (s *ServicesUser) CreateUser(user models.UserDataBase, ctx context.Context) error {
	if exist := s.repo.UsernameExist(user.Username, ctx); exist {
		return errors.New("Username ya existe")
	}
	if _, exist := s.repo.EmailExist(user.Gmail, ctx); exist {
		return errors.New("Email ya existe")
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
	log.Println("[SERVICE] Iniciando LogIn para usuario:", user.Username)
	log.Println("[SERVICE] Contraseña recibida:", user.Password)
	exist := s.repo.UsernameExist(user.Username, ctx)
	log.Println("[SERVICE] ¿Usuario existe?:", exist)
	if !exist {
		return "", errors.New("Credenciales invalidas")
	}
	password, err := s.cache.CachePassword(user.Username, ctx)
	if err != nil {
		log.Println("[SERVICE] Error obteniendo password:", err.Error())
		return "", err
	}
	log.Println("[SERVICE] Password de BD:", password)
	log.Println("[SERVICE] Password recibida:", user.Password)
	if !utils.ComparePassword(user.Password, password) {
		log.Println("[SERVICE] Contraseña INCORRECTA")
		return "", errors.New("Credenciales invalidas")
	}
	log.Println("[SERVICE] Contraseña CORRECTA")
	token, err := utils.GenerateToken(user.Username)
	if err != nil {
		return "", err
	}
	return token, nil
}
