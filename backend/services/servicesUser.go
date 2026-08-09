package services

import (
	"context"
	"errors"
	"fmt"
	"gorm/backend/cache"
	"gorm/backend/models"
	"gorm/backend/utils"
	"log"

	"gorm.io/gorm"
)

var DefaultCodeConfig = utils.Config{
	Longitud:                6,
	IncluirMayuscula:        false,
	IncluirMinuscula:        false,
	IncluirNumero:           true,
	IncluirCaracterEspecial: false,
}

type UserServicer interface {
	CreateUser(user models.UserDataBase, ctx context.Context) error
	LogIn(user models.UserLogin, ctx context.Context) (string, error)
	ActivateAccount(user models.UserActivate, ctx context.Context) error
	RecoverAccount(username string, ctx context.Context) (string, error)
	ResendCode(gmail string, ctx context.Context) error
	RecoverCuenta(user models.UserRecover, ctx context.Context) error
	ChangePassword(user models.UserChangePassword, ctx context.Context) error
	SendForgotPasswordCode(email string, ctx context.Context) error
	ForgotPasswordChange(email, code, newPassword string, ctx context.Context) error
	RecoverAndChangePassword(email, code, newPassword string, ctx context.Context) error
	GetTelephonByUsername(username string, ctx context.Context) (string, bool)
	SaveRefreshToken(username string, refreshToken string, ctx context.Context) error
	ValidateRefreshToken(username string, refreshToken string, ctx context.Context) error
	DeleteRefreshToken(username string, ctx context.Context) error
	RotateRefreshToken(oldToken, newToken, username string, ctx context.Context) error
}

type UserRepoInterface interface {
	UsernameExist(username string, ctx context.Context) bool
	EmailExist(email string, ctx context.Context) (string, bool)
	TelephonExist(telephon string, ctx context.Context) bool
	BeginTx() *gorm.DB
	CreateUserTx(tx *gorm.DB, user models.UserDataBase, ctx context.Context) error
	GetActivo(username string, ctx context.Context) (bool, bool)
	GetBlocked(username string, ctx context.Context) (bool, bool)
	GetPassword(username string, ctx context.Context) (string, bool)
	GetTelephonByUsername(username string, ctx context.Context) (string, bool)
	ActivateAccount(username string, ctx context.Context) error
	GetGmail(username string, ctx context.Context) (string, bool)
	BlockUser(username string, ctx context.Context) error
	UnblockUserByEmail(email string, ctx context.Context) error
	ChangePasswordByEmail(email, password string, ctx context.Context) error
	ChangePasswordByEmailTx(tx *gorm.DB, email, password string, ctx context.Context) error
	UnblockUserByEmailTx(tx *gorm.DB, email string, ctx context.Context) error
}

type UserCacheInterface interface {
	SaveRefreshToken(username string, refreshToken string, ctx context.Context) error
	GetRefreshToken(username string, ctx context.Context) (string, error)
	DeleteRefreshToken(username string, ctx context.Context) error
	CachePassword(username string, ctx context.Context) (string, error)
	CacheActivo(username string, ctx context.Context) (bool, error)
	SetCodigo(tipoCodigo string, username string, codigo string, ctx context.Context) error
	GetCodigo(tipoCodigo string, username string, ctx context.Context) (string, error)
	GetIntentosFallidos(username string, ctx context.Context) (int, error)
	IncrementFailedAttempts(username string, ctx context.Context) (int, error)
	ResetFailedAttempts(username string, ctx context.Context) error
	DeleteActivationCode(username string, ctx context.Context) error
}

type ServicesUser struct {
	repo       UserRepoInterface
	cache      UserCacheInterface
	tokenStore cache.TokenStore
}

func InitServices(repo UserRepoInterface, cache UserCacheInterface, tokenStore cache.TokenStore) UserServicer {
	return &ServicesUser{
		repo:       repo,
		cache:      cache,
		tokenStore: tokenStore,
	}
}

func (s *ServicesUser) CreateUser(user models.UserDataBase, ctx context.Context) error {
	if exist := s.repo.UsernameExist(user.Username, ctx); exist {
		return errors.New("Username ya existe")
	}
	if _, exist := s.repo.EmailExist(user.Email, ctx); exist {
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

	tx := s.repo.BeginTx()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	err = s.repo.CreateUserTx(tx, user, ctx)
	if err != nil {
		tx.Rollback()
		return errors.New("error al crear usuario")
	}

	codigo, err := utils.GenerarCodigo(DefaultCodeConfig)
	if err != nil {
		tx.Rollback()
		return errors.New("error al generar codigo, acceda a opcion recuperar cuenta")
	}

	err = s.cache.SetCodigo("activacion", user.Username, codigo, ctx)
	if err != nil {
		tx.Rollback()
		return errors.New("error al generar codigo, acceda a opcion recuperar cuenta")
	}

	err = utils.SendEmail(user.Email, "Codigo de activacion", "Su codigo de activacion es: "+codigo)
	if err != nil {
		log.Println("[SERVICE] Error enviando email:", err.Error())
		tx.Rollback()
		return errors.New("error al enviar codigo de activacion")
	}

	return tx.Commit().Error
}

func (s *ServicesUser) LogIn(user models.UserLogin, ctx context.Context) (string, error) {
	log.Println("[SERVICE] Iniciando LogIn para usuario:", user.Username)
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
		return "", fmt.Errorf("error obteniendo password: %w", err)
	}
	if !utils.ComparePassword(user.Password, password) {
		err = s.chequearIntentosFallidos(user.Username, ctx)
		if err != nil {
			return "", err
		}
		return "", errors.New("Credenciales invalidas")
	}

	if err := s.cache.ResetFailedAttempts(user.Username, ctx); err != nil {
		log.Printf("[LogIn] error reseteando intentos fallidos: %v", err)
	}

	telephon, exist := s.repo.GetTelephonByUsername(user.Username, ctx)
	if !exist {
		return "", errors.New("error al obtener telephon del usuario")
	}

	token, err := utils.GenerateToken(user.Username, telephon)
	if err != nil {
		return "", fmt.Errorf("error generando token: %w", err)
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
		return fmt.Errorf("error al obtener el codigo: %w", err)
	}

	if codigoCache != user.Code {
		return errors.New("codigo incorrecto")
	}
	err = s.repo.ActivateAccount(user.Username, ctx)
	if err != nil {
		return fmt.Errorf("error al activar la cuenta: %w", err)
	}

	if err := s.cache.DeleteActivationCode(user.Username, ctx); err != nil {
		log.Printf("[ActivateAccount] error eliminando codigo de activacion: %v", err)
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

	codigo, err := utils.GenerarCodigo(DefaultCodeConfig)
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
	if err != nil {
		return "", fmt.Errorf("error enviando email de recuperacion: %w", err)
	}
	return username, nil
}

func (s *ServicesUser) chequearIntentosFallidos(username string, ctx context.Context) error {
	intentos, err := s.cache.IncrementFailedAttempts(username, ctx)
	if err != nil {
		return err
	}
	if intentos >= 5 {
		err = s.repo.BlockUser(username, ctx)
		if err != nil {
			return err
		}
		err = s.cache.ResetFailedAttempts(username, ctx)
		if err != nil {
			return err
		}
		return errors.New("usuario bloqueado por demasiados intentos fallidos")
	}
	return nil
}

func (s *ServicesUser) ResendCode(gmail string, ctx context.Context) error {
	_, exist := s.repo.EmailExist(gmail, ctx)
	if !exist {
		return errors.New("email no existe")
	}
	codigo, err := utils.GenerarCodigo(DefaultCodeConfig)
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

func (s *ServicesUser) SendForgotPasswordCode(email string, ctx context.Context) error {
	_, exist := s.repo.EmailExist(email, ctx)
	if !exist {
		return errors.New("email no existe")
	}

	codigo, err := utils.GenerarCodigo(DefaultCodeConfig)
	if err != nil {
		return errors.New("error al generar codigo")
	}
	err = s.cache.SetCodigo("forgot", email, codigo, ctx)
	if err != nil {
		return errors.New("error al guardar codigo")
	}
	err = utils.SendEmail(email, "Código de recuperación de contraseña", "Su código de recuperación es: "+codigo)
	if err != nil {
		log.Println("[SERVICE] Error enviando email:", err.Error())
		return errors.New("error al enviar codigo")
	}
	return nil
}

func (s *ServicesUser) ForgotPasswordChange(email, code, newPassword string, ctx context.Context) error {
	_, exist := s.repo.EmailExist(email, ctx)
	if !exist {
		return errors.New("email no existe")
	}

	codigoCache, err := s.cache.GetCodigo("forgot", email, ctx)
	if err != nil {
		return errors.New("error al obtener el codigo")
	}
	if codigoCache != code {
		return errors.New("codigo incorrecto")
	}

	hash_password, err := utils.Hash(newPassword)
	if err != nil {
		return errors.New("error al procesar la contraseña")
	}

	tx := s.repo.BeginTx()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	err = s.repo.ChangePasswordByEmailTx(tx, email, hash_password, ctx)
	if err != nil {
		tx.Rollback()
		return errors.New("error al cambiar la contraseña")
	}

	return tx.Commit().Error
}

func (s *ServicesUser) RecoverAndChangePassword(email, code, newPassword string, ctx context.Context) error {
	_, exist := s.repo.EmailExist(email, ctx)
	if !exist {
		return errors.New("email no existe")
	}

	codigoCache, err := s.cache.GetCodigo("bloqueado", email, ctx)
	if err != nil {
		return errors.New("error al obtener el codigo")
	}
	if codigoCache != code {
		return errors.New("codigo incorrecto")
	}

	hash_password, err := utils.Hash(newPassword)
	if err != nil {
		return errors.New("error al procesar la contraseña")
	}

	tx := s.repo.BeginTx()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	err = s.repo.UnblockUserByEmailTx(tx, email, ctx)
	if err != nil {
		tx.Rollback()
		return errors.New("error al desbloquear la cuenta")
	}

	err = s.repo.ChangePasswordByEmailTx(tx, email, hash_password, ctx)
	if err != nil {
		tx.Rollback()
		return errors.New("error al cambiar la contraseña")
	}

	return tx.Commit().Error
}

func (s *ServicesUser) GetTelephonByUsername(username string, ctx context.Context) (string, bool) {
	return s.repo.GetTelephonByUsername(username, ctx)
}

func (s *ServicesUser) SaveRefreshToken(username string, refreshToken string, ctx context.Context) error {
	return s.cache.SaveRefreshToken(username, refreshToken, ctx)
}

func (s *ServicesUser) ValidateRefreshToken(username string, refreshToken string, ctx context.Context) error {
	stored, err := s.cache.GetRefreshToken(username, ctx)
	if err != nil {
		return errors.New("refresh token expirado o inexistente")
	}
	if stored != refreshToken {
		return errors.New("refresh token invalido")
	}
	return nil
}

func (s *ServicesUser) DeleteRefreshToken(username string, ctx context.Context) error {
	return s.cache.DeleteRefreshToken(username, ctx)
}

// RotateRefreshToken rota el refresh token de forma atómica (DEL old + SET new)
// delegando en el TokenStore. Garantiza que el token viejo queda invalidado en
// la misma operación en la que se guarda el nuevo (C1).
func (s *ServicesUser) RotateRefreshToken(oldToken, newToken, username string, ctx context.Context) error {
	return s.tokenStore.RotateRefreshToken(oldToken, newToken, username, ctx)
}
