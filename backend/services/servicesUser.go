package services

import (
	"context"
	"errors"
	"gorm/backend/models"
	"gorm/backend/utils"
	"log"

	"gorm.io/gorm"
)

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
	SetIntentosFallidos(username string, intentos int, ctx context.Context) error
}

type ServicesUser struct {
	repo  UserRepoInterface
	cache UserCacheInterface
}

// InitServices crea el servicio de autenticación con repositorio y caché, devolviendo la interfaz UserServicer.
func InitServices(repo UserRepoInterface, cache UserCacheInterface) UserServicer {
	return &ServicesUser{
		repo:  repo,
		cache: cache,
	}
}

// CreateUser registra un nuevo usuario: valida unicidad, hashea la contraseña,
// crea el registro en BD dentro de una transacción y envía el código de activación por email.
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

// LogIn autentica al usuario: verifica estado activo/bloqueado, compara la
// contraseña con bcrypt y genera un JWT con username + telephon.
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
		return "", err
	}
	if !utils.ComparePassword(user.Password, password) {
		err = s.chequearIntentosFallidos(user.Username, ctx)
		if err != nil {
			return "", err
		}
		return "", errors.New("Credenciales invalidas")
	}

	// Obtener el telephon del usuario para generar el token
	telephon, exist := s.repo.GetTelephonByUsername(user.Username, ctx)
	if !exist {
		return "", errors.New("error al obtener telephon del usuario")
	}

	token, err := utils.GenerateToken(user.Username, telephon)
	if err != nil {
		return "", err
	}
	return token, nil
}

// ActivateAccount activa la cuenta del usuario verificando que el código de
// activación en Redis coincida con el suministrado.
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

// RecoverAccount genera y envía un código de recuperación al email del usuario.
// Verifica previamente que la cuenta no esté bloqueada.
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

// chequearIntentosFallidos incrementa el contador de intentos fallidos del usuario
// y lo bloquea automáticamente al alcanzar 5 intentos.
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

// ResendCode genera y envía un nuevo código de desbloqueo al email del usuario.
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

// RecoverCuenta desbloquea la cuenta del usuario verificando el código enviado al email.
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

// ChangePassword actualiza la contraseña del usuario buscando por email.
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

// SendForgotPasswordCode envía código para recuperar contraseña
func (s *ServicesUser) SendForgotPasswordCode(email string, ctx context.Context) error {
	_, exist := s.repo.EmailExist(email, ctx)
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

// ForgotPasswordChange verifica código y cambia contraseña en una transacción
func (s *ServicesUser) ForgotPasswordChange(email, code, newPassword string, ctx context.Context) error {
	_, exist := s.repo.EmailExist(email, ctx)
	if !exist {
		return errors.New("email no existe")
	}

	// Verificar código
	codigoCache, err := s.cache.GetCodigo("forgot", email, ctx)
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

	// Cambiar contraseña
	err = s.repo.ChangePasswordByEmailTx(tx, email, hash_password, ctx)
	if err != nil {
		tx.Rollback()
		return errors.New("error al cambiar la contraseña")
	}

	// Commit si todo fue exitoso
	return tx.Commit().Error
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

// GetTelephonByUsername obtiene el telephon de un usuario dado su username
func (s *ServicesUser) GetTelephonByUsername(username string, ctx context.Context) (string, bool) {
	return s.repo.GetTelephonByUsername(username, ctx)
}

// SaveRefreshToken guarda un refresh token en Redis para el usuario
func (s *ServicesUser) SaveRefreshToken(username string, refreshToken string, ctx context.Context) error {
	return s.cache.SaveRefreshToken(username, refreshToken, ctx)
}

// ValidateRefreshToken valida que el refresh token enviado coincida con el almacenado
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

// DeleteRefreshToken elimina el refresh token (logout)
func (s *ServicesUser) DeleteRefreshToken(username string, ctx context.Context) error {
	return s.cache.DeleteRefreshToken(username, ctx)
}
