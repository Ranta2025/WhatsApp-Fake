package services

import (
	"context"
	"crypto/subtle"
	"errors"
	"gorm/backend/models"
	"gorm/backend/utils"
	"log"

	"gorm.io/gorm"
)

const (
	// maxIntentosLogin es el número de fallos de contraseña permitidos antes de bloquear la cuenta.
	maxIntentosLogin = 5
	// maxIntentosCodigo es el número de códigos incorrectos permitidos antes de invalidar el código.
	maxIntentosCodigo = 5
)

type UserServicer interface {
	CreateUser(user models.UserDataBase, ctx context.Context) error
	LogIn(user models.UserLogin, ctx context.Context) (string, error)
	ActivateAccount(user models.UserActivate, ctx context.Context) error
	RecoverAccount(username string, ctx context.Context) (string, error)
	ResendCode(gmail string, ctx context.Context) error
	RecoverCuenta(user models.UserRecover, ctx context.Context) error
	SendForgotPasswordCode(email string, ctx context.Context) error
	ForgotPasswordChange(email, code, newPassword string, ctx context.Context) error
	RecoverAndChangePassword(email, code, newPassword string, ctx context.Context) error
	GetTelephonByUsername(username string, ctx context.Context) (string, bool)
	SaveRefreshToken(telephon string, refreshToken string, ctx context.Context) error
	RefreshSession(refreshToken string, ctx context.Context) (username string, telephon string, err error)
	DeleteRefreshToken(refreshToken string, ctx context.Context) error
}

type UserRepoInterface interface {
	UsernameExist(username string, ctx context.Context) bool
	EmailExist(email string, ctx context.Context) (string, bool)
	TelephonExist(telephon string, ctx context.Context) bool
	BeginTx() *gorm.DB
	CreateUserTx(tx *gorm.DB, user models.UserDataBase, ctx context.Context) error
	GetAuthByUsername(username string, ctx context.Context) (*models.UserAuth, error)
	GetAuthByTelephon(telephon string, ctx context.Context) (*models.UserAuth, error)
	GetAuthByEmail(email string, ctx context.Context) (*models.UserAuth, error)
	GetTelephonByUsername(username string, ctx context.Context) (string, bool)
	ActivateAccount(username string, ctx context.Context) error
	BlockUser(username string, ctx context.Context) error
	UnblockUserByEmail(email string, ctx context.Context) error
	ChangePasswordByEmailTx(tx *gorm.DB, email, password string, ctx context.Context) error
	UnblockUserByEmailTx(tx *gorm.DB, email string, ctx context.Context) error
}

type UserCacheInterface interface {
	SaveRefreshToken(telephon string, refreshToken string, ctx context.Context) error
	ConsumeRefreshToken(refreshToken string, ctx context.Context) (string, error)
	DeleteRefreshToken(refreshToken string, ctx context.Context) error
	RevokeAllRefreshTokens(telephon string, ctx context.Context) error
	SetCodigo(tipoCodigo string, key string, codigo string, ctx context.Context) error
	GetCodigo(tipoCodigo string, key string, ctx context.Context) (string, error)
	DeleteCodigo(tipoCodigo string, key string, ctx context.Context) error
	IncrCodigoIntentos(tipoCodigo string, key string, ctx context.Context) (int, error)
	IncrIntentosFallidos(username string, ctx context.Context) (int, error)
	ResetIntentosFallidos(username string, ctx context.Context) error
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

// generarCodigoNumerico genera un código numérico de 6 dígitos.
func generarCodigoNumerico() (string, error) {
	return utils.GenerarCodigo(utils.Config{
		Longitud:      6,
		IncluirNumero: true,
	})
}

// verificarCodigo compara el código recibido con el guardado en Redis en tiempo
// constante. Tras maxIntentosCodigo fallos el código se invalida para impedir
// ataques de fuerza bruta sobre los 10^6 códigos posibles.
func (s *ServicesUser) verificarCodigo(tipo, key, code string, ctx context.Context) error {
	codigoCache, err := s.cache.GetCodigo(tipo, key, ctx)
	if err != nil {
		return errors.New("codigo expirado o inexistente, solicite uno nuevo")
	}
	if subtle.ConstantTimeCompare([]byte(codigoCache), []byte(code)) == 1 {
		return nil
	}
	intentos, err := s.cache.IncrCodigoIntentos(tipo, key, ctx)
	if err == nil && intentos >= maxIntentosCodigo {
		_ = s.cache.DeleteCodigo(tipo, key, ctx)
		return errors.New("demasiados intentos incorrectos, solicite un nuevo codigo")
	}
	return errors.New("codigo incorrecto")
}

// consumirCodigo elimina el código tras usarlo con éxito (los códigos son de un solo uso).
func (s *ServicesUser) consumirCodigo(tipo, key string, ctx context.Context) {
	if err := s.cache.DeleteCodigo(tipo, key, ctx); err != nil {
		log.Printf("[SERVICE] Error eliminando codigo %s: %v", tipo, err)
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
	user.Bloqueado = false

	// Inicia transacción
	tx := s.repo.BeginTx()
	if tx.Error != nil {
		return errors.New("error al crear usuario")
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
			panic(r)
		}
	}()

	// Crear usuario dentro de transacción
	err = s.repo.CreateUserTx(tx, user, ctx)
	if err != nil {
		tx.Rollback()
		return errors.New("error al crear usuario")
	}

	// Generar código
	codigo, err := generarCodigoNumerico()
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

// LogIn autentica al usuario: verifica estado de bloqueo, compara la contraseña
// con bcrypt, verifica la activación y genera un JWT con username + telephon.
// Obtiene todos los datos del usuario en una única consulta.
func (s *ServicesUser) LogIn(user models.UserLogin, ctx context.Context) (string, error) {
	auth, err := s.repo.GetAuthByUsername(user.Username, ctx)
	if err != nil {
		return "", errors.New("Credenciales invalidas")
	}
	if auth.Bloqueado {
		return "", errors.New("usuario bloqueado")
	}

	if !utils.ComparePassword(user.Password, auth.Password) {
		if err := s.registrarIntentoFallido(auth, ctx); err != nil {
			return "", err
		}
		return "", errors.New("Credenciales invalidas")
	}

	// La activación se comprueba después de la contraseña para no revelar el
	// estado de la cuenta a quien no conoce las credenciales.
	if !auth.Activo {
		return "", errors.New("usuario inactivo")
	}

	// Login correcto: reiniciar el contador de intentos fallidos
	if err := s.cache.ResetIntentosFallidos(auth.Username, ctx); err != nil {
		log.Printf("[SERVICE] Error reiniciando intentos fallidos: %v", err)
	}

	return utils.GenerateToken(auth.Username, auth.Telephon)
}

// ActivateAccount activa la cuenta del usuario verificando que el código de
// activación en Redis coincida con el suministrado.
func (s *ServicesUser) ActivateAccount(user models.UserActivate, ctx context.Context) error {
	if !s.repo.UsernameExist(user.Username, ctx) {
		return errors.New("usuario no existe")
	}

	if err := s.verificarCodigo("activacion", user.Username, user.Code, ctx); err != nil {
		return err
	}

	if err := s.repo.ActivateAccount(user.Username, ctx); err != nil {
		return errors.New("error al activar la cuenta")
	}
	s.consumirCodigo("activacion", user.Username, ctx)
	return nil
}

// RecoverAccount genera y envía un código de activación al email del usuario.
// Verifica previamente que la cuenta exista y no esté bloqueada.
func (s *ServicesUser) RecoverAccount(username string, ctx context.Context) (string, error) {
	auth, err := s.repo.GetAuthByUsername(username, ctx)
	if err != nil {
		return "", errors.New("usuario no existe")
	}
	if auth.Bloqueado {
		return "", errors.New("usuario bloqueado")
	}

	codigo, err := generarCodigoNumerico()
	if err != nil {
		return "", errors.New("error al generar codigo")
	}
	if err := s.cache.SetCodigo("activacion", username, codigo, ctx); err != nil {
		return "", errors.New("error al generar codigo")
	}
	if err := utils.SendEmail(auth.Gmail, "Codigo de activacion", "Su codigo de activacion es: "+codigo); err != nil {
		log.Println("[SERVICE] Error enviando email:", err.Error())
		return "", errors.New("error al enviar codigo de activacion")
	}
	return username, nil
}

// registrarIntentoFallido incrementa de forma atómica el contador de intentos
// fallidos del usuario y lo bloquea (revocando sus sesiones) al superar el máximo.
func (s *ServicesUser) registrarIntentoFallido(auth *models.UserAuth, ctx context.Context) error {
	intentos, err := s.cache.IncrIntentosFallidos(auth.Username, ctx)
	if err != nil {
		return err
	}
	if intentos <= maxIntentosLogin {
		return nil
	}
	if err := s.repo.BlockUser(auth.Username, ctx); err != nil {
		return err
	}
	if err := s.cache.ResetIntentosFallidos(auth.Username, ctx); err != nil {
		log.Printf("[SERVICE] Error reiniciando intentos fallidos: %v", err)
	}
	if err := s.cache.RevokeAllRefreshTokens(auth.Telephon, ctx); err != nil {
		log.Printf("[SERVICE] Error revocando sesiones: %v", err)
	}
	return errors.New("usuario bloqueado por demasiados intentos fallidos")
}

// ResendCode genera y envía un nuevo código de desbloqueo al email del usuario.
func (s *ServicesUser) ResendCode(gmail string, ctx context.Context) error {
	_, exist := s.repo.EmailExist(gmail, ctx)
	if !exist {
		return errors.New("email no existe")
	}
	codigo, err := generarCodigoNumerico()
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
	auth, err := s.repo.GetAuthByEmail(user.Email, ctx)
	if err != nil {
		return errors.New("email no existe")
	}
	if err := s.verificarCodigo("bloqueado", user.Email, user.Code, ctx); err != nil {
		return err
	}
	if err := s.repo.UnblockUserByEmail(user.Email, ctx); err != nil {
		return errors.New("error al desbloquear la cuenta")
	}
	s.consumirCodigo("bloqueado", user.Email, ctx)
	_ = s.cache.ResetIntentosFallidos(auth.Username, ctx)
	return nil
}

// SendForgotPasswordCode envía código para recuperar contraseña
func (s *ServicesUser) SendForgotPasswordCode(email string, ctx context.Context) error {
	_, exist := s.repo.EmailExist(email, ctx)
	if !exist {
		return errors.New("email no existe")
	}

	codigo, err := generarCodigoNumerico()
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

// ForgotPasswordChange verifica el código y cambia la contraseña. Revoca todas
// las sesiones abiertas del usuario.
func (s *ServicesUser) ForgotPasswordChange(email, code, newPassword string, ctx context.Context) error {
	return s.cambiarPasswordConCodigo("forgot", email, code, newPassword, false, ctx)
}

// RecoverAndChangePassword desbloquea la cuenta y cambia la contraseña en una
// sola transacción, tras verificar el código de desbloqueo.
func (s *ServicesUser) RecoverAndChangePassword(email, code, newPassword string, ctx context.Context) error {
	return s.cambiarPasswordConCodigo("bloqueado", email, code, newPassword, true, ctx)
}

// cambiarPasswordConCodigo implementa el flujo común de cambio de contraseña
// verificado por código (y opcionalmente desbloqueo) en una transacción.
func (s *ServicesUser) cambiarPasswordConCodigo(tipoCodigo, email, code, newPassword string, desbloquear bool, ctx context.Context) error {
	auth, err := s.repo.GetAuthByEmail(email, ctx)
	if err != nil {
		return errors.New("email no existe")
	}

	if err := s.verificarCodigo(tipoCodigo, email, code, ctx); err != nil {
		return err
	}

	hash_password, err := utils.Hash(newPassword)
	if err != nil {
		return errors.New("error al procesar la contraseña")
	}

	tx := s.repo.BeginTx()
	if tx.Error != nil {
		return errors.New("error al cambiar la contraseña")
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
			panic(r)
		}
	}()

	if desbloquear {
		if err := s.repo.UnblockUserByEmailTx(tx, email, ctx); err != nil {
			tx.Rollback()
			return errors.New("error al desbloquear la cuenta")
		}
	}

	if err := s.repo.ChangePasswordByEmailTx(tx, email, hash_password, ctx); err != nil {
		tx.Rollback()
		return errors.New("error al cambiar la contraseña")
	}

	if err := tx.Commit().Error; err != nil {
		return errors.New("error al cambiar la contraseña")
	}

	s.consumirCodigo(tipoCodigo, email, ctx)
	_ = s.cache.ResetIntentosFallidos(auth.Username, ctx)
	// Cerrar todas las sesiones abiertas con la contraseña anterior
	if err := s.cache.RevokeAllRefreshTokens(auth.Telephon, ctx); err != nil {
		log.Printf("[SERVICE] Error revocando sesiones: %v", err)
	}
	return nil
}

// GetTelephonByUsername obtiene el telephon de un usuario dado su username
func (s *ServicesUser) GetTelephonByUsername(username string, ctx context.Context) (string, bool) {
	return s.repo.GetTelephonByUsername(username, ctx)
}

// SaveRefreshToken guarda un refresh token en Redis para el usuario (por teléfono).
func (s *ServicesUser) SaveRefreshToken(telephon string, refreshToken string, ctx context.Context) error {
	return s.cache.SaveRefreshToken(telephon, refreshToken, ctx)
}

// RefreshSession valida un refresh token y lo consume (rotación): cada refresh
// token solo puede usarse una vez. Devuelve el username actual (puede haber
// cambiado) y el teléfono del usuario, verificando que la cuenta siga activa
// y no bloqueada.
func (s *ServicesUser) RefreshSession(refreshToken string, ctx context.Context) (string, string, error) {
	// Rotación: el token se consume de forma atómica (un solo uso), así dos
	// refresh concurrentes con el mismo token no pueden obtener ambos sesión.
	telephon, err := s.cache.ConsumeRefreshToken(refreshToken, ctx)
	if err != nil || telephon == "" {
		return "", "", errors.New("refresh token expirado o inexistente")
	}

	auth, err := s.repo.GetAuthByTelephon(telephon, ctx)
	if err != nil {
		return "", "", errors.New("usuario no encontrado")
	}
	if auth.Bloqueado {
		_ = s.cache.RevokeAllRefreshTokens(telephon, ctx)
		return "", "", errors.New("usuario bloqueado")
	}
	if !auth.Activo {
		return "", "", errors.New("usuario inactivo")
	}
	return auth.Username, auth.Telephon, nil
}

// DeleteRefreshToken invalida el refresh token (logout)
func (s *ServicesUser) DeleteRefreshToken(refreshToken string, ctx context.Context) error {
	return s.cache.DeleteRefreshToken(refreshToken, ctx)
}
