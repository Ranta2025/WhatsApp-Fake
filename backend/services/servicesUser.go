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
	if exist := s.repo.TelephonExist(user.Telephon, ctx); exist {
		return errors.New("Telefono ya existe")
	}
	hash_password, err := utils.Hash(user.Password)
	if err != nil {
		return errors.New("Error al crear usuario")
	}
	user.Password = hash_password
	user.Activo = false

	// Inicia transacción
	tx := s.repo.BeginTx()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	// Crear usuario dentro de transacción
	err = s.repo.CreateUserTx(tx, user, ctx)
	if err != nil {
		tx.Rollback()
		return errors.New("error al crear usuario")
	}

	// Generar código
	codigo, err := utils.GenerarCodigo(utils.Config{
		Longitud:                6,
		IncluirMayuscula:        false,
		IncluirMinuscula:        false,
		IncluirNumero:           true,
		IncluirCaracterEspecial: false,
	})
	if err != nil {
		tx.Rollback()
		return errors.New("error al generar codigo, acceda a opcion recuperar cuenta")
	}

	// Guardar código en cache
	err = s.cache.SetCodigo("activacion", user.Username, codigo, ctx)
	if err != nil {
		tx.Rollback()
		return errors.New("error al generar codigo, acceda a opcion recuperar cuenta")
	}

	// Enviar email
	err = utils.SendEmail(user.Gmail, "Codigo de activacion", "Su codigo de activacion es: "+codigo)
	if err != nil {
		log.Println("[SERVICE] Error enviando email:", err.Error())
		tx.Rollback()
		return errors.New("error al enviar codigo de activacion")
	}

	// Commit si todo fue exitoso
	return tx.Commit().Error
}

func (s *ServicesUser) LogIn(user models.UserLogin, ctx context.Context) (string, error) {
	log.Println("[SERVICE] Iniciando LogIn para usuario:", user.Username)
	log.Println("[SERVICE] Contraseña recibida:", user.Password)
	exist := s.repo.UsernameExist(user.Username, ctx)
	log.Println("[SERVICE] ¿Usuario existe?:", exist)
	if !exist {
		return "", errors.New("Credenciales invalidas")
	}
	activo, exist := s.repo.GetActivo(user.Username, ctx)
	if !exist {
		return "", errors.New("error al obtener estado de activacion")
	}
	if !activo {
		return "", errors.New("usuario inactivo")
	}
	bloqueado, exist := s.repo.GetBlocked(user.Username, ctx)
	if !exist {
		return "", errors.New("error al obtener estado de bloqueo")
	}
	if bloqueado {
		return "", errors.New("usuario bloqueado")
	}

	password, err := s.cache.CachePassword(user.Username, ctx)
	if err != nil {
		return "", err
	}
	if !utils.ComparePassword(user.Password, password) {
		err = s.chequearIntentosFallidos(user.Username, ctx)
		if err != nil {
			return "", err
		}
		return "", errors.New("Credenciales invalidas")
	}

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

	codigoCache, err := s.cache.GetCodigo("activacion", user.Username, ctx)
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

func (s *ServicesUser) RecoverAccount(username string, ctx context.Context) (string, error) {

	bloqueado, exist := s.repo.GetBlocked(username, ctx)
	if !exist {
		return "", errors.New("error al obtener estado de bloqueo")
	}
	if bloqueado {
		return "", errors.New("usuario bloqueado")
	}

	codigo, err := utils.GenerarCodigo(utils.Config{
		Longitud:                6,
		IncluirMayuscula:        false,
		IncluirMinuscula:        false,
		IncluirNumero:           true,
		IncluirCaracterEspecial: false,
	})
	if err != nil {
		return "", errors.New("error al generar codigo")
	}
	err = s.cache.SetCodigo("activacion", username, codigo, ctx)
	if err != nil {
		return "", errors.New("error al generar codigo")
	}
	email, exist := s.repo.GetGmail(username, ctx)
	if !exist {
		return "", errors.New("error al obtener email")
	}
	err = utils.SendEmail(email, "Codigo de activacion", "Su codigo de activacion es: "+codigo)
	return username, nil
}

func (s *ServicesUser) chequearIntentosFallidos(username string, ctx context.Context) error {
	intentos, err := s.cache.GetIntentosFallidos(username, ctx)
	if err != nil {
		return err
	}
	if intentos >= 5 {
		err = s.repo.BlockUser(username, ctx)
		if err != nil {
			return err
		}
		err = s.cache.SetIntentosFallidos(username, 0, ctx)
		if err != nil {
			return err
		}
		return errors.New("usuario bloqueado por demasiados intentos fallidos")
	}
	err = s.cache.SetIntentosFallidos(username, intentos+1, ctx)
	if err != nil {
		return err
	}
	return nil
}

func (s *ServicesUser) ResendCode(gmail string, ctx context.Context) error {
	_, exist := s.repo.EmailExist(gmail, ctx)
	if !exist {
		return errors.New("email no existe")
	}
	codigo, err := utils.GenerarCodigo(utils.Config{
		Longitud:                6,
		IncluirMayuscula:        false,
		IncluirMinuscula:        false,
		IncluirNumero:           true,
		IncluirCaracterEspecial: false,
	})
	if err != nil {
		return errors.New("error al generar codigo")
	}
	err = s.cache.SetCodigo("bloqueado", gmail, codigo, ctx)
	if err != nil {
		return errors.New("error al generar codigo")
	}
	err = utils.SendEmail(gmail, "Codigo de desbloqueo", "Su codigo de desbloqueo es: "+codigo)
	if err != nil {
		log.Println("[SERVICE] Error enviando email:", err.Error())
		return errors.New("error al enviar codigo de activacion")
	}
	return nil
}

func (s *ServicesUser) RecoverCuenta(user models.UserRecover, ctx context.Context) error {
	_, exist := s.repo.EmailExist(user.Email, ctx)
	if !exist {
		return errors.New("email no existe")
	}
	codigoCache, err := s.cache.GetCodigo("bloqueado", user.Email, ctx)
	if err != nil {
		return errors.New("error al obtener el codigo")
	}
	if codigoCache != user.Code {
		return errors.New("codigo incorrecto")
	}
	err = s.repo.UnblockUserByEmail(user.Email, ctx)
	if err != nil {
		return errors.New("error al desbloquear la cuenta")
	}
	return nil
}

func (s *ServicesUser) ChangePassword(user models.UserChangePassword, ctx context.Context) error {
	_, exist := s.repo.EmailExist(user.Gmail, ctx)
	if !exist {
		return errors.New("email no existe")
	}
	hash_password, err := utils.Hash(user.Password)
	if err != nil {
		return errors.New("error al cambiar la contraseña")
	}
	err = s.repo.ChangePasswordByEmail(user.Gmail, hash_password, ctx)
	if err != nil {
		return errors.New("error al cambiar la contraseña")
	}
	return nil
}

// Nueva función que combina desbloqueo + cambio de contraseña en 1 transacción
func (s *ServicesUser) RecoverAndChangePassword(email, code, newPassword string, ctx context.Context) error {
	_, exist := s.repo.EmailExist(email, ctx)
	if !exist {
		return errors.New("email no existe")
	}

	// Verificar código
	codigoCache, err := s.cache.GetCodigo("bloqueado", email, ctx)
	if err != nil {
		return errors.New("error al obtener el codigo")
	}
	if codigoCache != code {
		return errors.New("codigo incorrecto")
	}

	// Hashear nueva contraseña
	hash_password, err := utils.Hash(newPassword)
	if err != nil {
		return errors.New("error al procesar la contraseña")
	}

	// Iniciar transacción
	tx := s.repo.BeginTx()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	// 1. Desbloquear usuario
	err = s.repo.UnblockUserByEmailTx(tx, email, ctx)
	if err != nil {
		tx.Rollback()
		return errors.New("error al desbloquear la cuenta")
	}

	// 2. Cambiar contraseña
	err = s.repo.ChangePasswordByEmailTx(tx, email, hash_password, ctx)
	if err != nil {
		tx.Rollback()
		return errors.New("error al cambiar la contraseña")
	}

	// Commit si todo fue exitoso
	return tx.Commit().Error
}
