package services

import (
	"context"
	"errors"
	"gorm/backend/cache"
	"gorm/backend/models"
	"gorm/backend/repos"
	"gorm/backend/utils"
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
	user.Activo = false
	err = s.repo.CreateUser(user, ctx)
	if err != nil {
		return errors.New("error al crear usuario")
	}
	codigo, err := utils.GenerarCodigo(utils.Config{
		Longitud: 6,
		IncluirMayuscula: true,
		IncluirMinuscula: true,
		IncluirNumero: true,
		IncluirCaracterEspecial: true,
	})
	if err != nil {
		return errors.New("error al generar codigo, acceda a opcion recuperar cuenta")
	}
	err = s.cache.SetCodigo(user.Username, codigo, ctx)
	if err != nil {
		return errors.New("error al generar codigo, acceda a opcion recuperar cuenta")
	}
	err = utils.SendEmail(user.Gmail, "Codigo de activacion", "Su codigo de activacion es: "+codigo)
	if err != nil {
		log.Println("[SERVICE] Error enviando email:", err.Error())
		return errors.New("error al enviar codigo de activacion")
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
	activo,err := s.cache.CacheActivo(user.Username, ctx)
	if err != nil {
		return "", err
	}
	if !activo {
		return "", errors.New("usuario inactivo")
	}
	log.Println("[SERVICE] Contraseña CORRECTA")
	token, err := utils.GenerateToken(user.Username)
	if err != nil {
		return "", err
	}
	return token, nil
}

func (s *ServicesUser) ActivateAccount(user models.UserActivate, ctx context.Context) error {
	exist := s.repo.UsernameExist(user.Username, ctx)
	if !exist {
		return errors.New("usuario no existe")
	}

	codigoCache, err := s.cache.GetCodigo(user.Username, ctx)
	if err != nil {
		return errors.New("error al obtener el codigo")
	}

	if codigoCache != user.Code {
		return errors.New("codigo incorrecto")
	}
	err = s.repo.ActivateAccount(user.Username, ctx)
	if err != nil {
		return errors.New("error al activar la cuenta")
	} 
	return nil
}

func (s *ServicesUser) RecoverAccount(email string, ctx context.Context) (string, error) {
	username, exist := s.repo.GetUsernameByEmail(email, ctx)
	if !exist {
		return "", errors.New("email no registrado")
	}
	codigo, err := utils.GenerarCodigo(utils.Config{
		Longitud: 6,
		IncluirMayuscula: true,
		IncluirMinuscula: true,
		IncluirNumero: true,
		IncluirCaracterEspecial: true,
	})
	if err != nil {
		return "", errors.New("error al generar codigo")
	}
	err = s.cache.SetCodigo(username, codigo, ctx)
	if err != nil {
		return "", errors.New("error al generar codigo")
	}
	err = utils.SendEmail(email, "Codigo de activacion", "Su codigo de activacion es: "+codigo)
	return username, nil	
}