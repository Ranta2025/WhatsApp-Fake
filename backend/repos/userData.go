package repos

import (
	"context"
	"errors"
	"gorm/backend/models"
	"log"
	"time"

	"gorm.io/gorm"
)

type RepositoriesUser struct {
	db *gorm.DB
}

// GetRespositorieUser crea el repositorio de usuarios con la conexión GORM.
func GetRespositorieUser(db *gorm.DB) *RepositoriesUser {
	return &RepositoriesUser{db: db}
}

// BeginTx inicia una transacción
func (db *RepositoriesUser) BeginTx() *gorm.DB {
	return db.db.Begin()
}

// CreateUser persiste un nuevo UserDataBase en la BD.
func (db *RepositoriesUser) CreateUser(user models.UserDataBase, c context.Context) error {
	ctx, cancel := context.WithTimeout(c, 10*time.Second)
	defer cancel()
	return db.db.WithContext(ctx).Create(&user).Error
}

// CreateUserTx crea usuario dentro de una transacción
func (db *RepositoriesUser) CreateUserTx(tx *gorm.DB, user models.UserDataBase, c context.Context) error {
	ctx, cancel := context.WithTimeout(c, 10*time.Second)
	defer cancel()
	return tx.WithContext(ctx).Create(&user).Error
}

// UsernameExist comprueba si ya existe un usuario con ese username en la BD.
func (db *RepositoriesUser) UsernameExist(username string, c context.Context) bool {
	ctx, cancel := context.WithTimeout(c, 10*time.Second)
	defer cancel()
	var usernameDB string
	result := db.db.Model(&models.UserDataBase{}).WithContext(ctx).Select("username").Where("username = ?", username).Scan(&usernameDB)
	log.Println("[REPO] Buscando username:", username)
	log.Println("[REPO] Resultado de búsqueda:", usernameDB)
	log.Println("[REPO] Error:", result.Error)
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			log.Println("[REPO] Username NO existe")
			return false
		}
		log.Println("[REPO] Error en query:", result.Error)
		return false
	}
	if usernameDB == "" {
		log.Println("[REPO] Username NO existe (vacío)")
		return false
	}
	log.Println("[REPO] Username EXISTE")
	return true
}

// GetGmail devuelve el email registrado para el username; segundo valor indica si fue encontrado.
func (db *RepositoriesUser) GetGmail(username string, c context.Context) (string, bool) {
	ctx, cancel := context.WithTimeout(c, 10*time.Second)
	defer cancel()
	var gmail string
	result := db.db.Model(&models.UserDataBase{}).WithContext(ctx).Select("gmail").Where("username = ?", username).Scan(&gmail)
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return "", false
		}
		return "", false
	}
	return gmail, true
}

// EmailExist verifica si ya existe el email en la BD y devuelve el email si existe.
func (db *RepositoriesUser) EmailExist(email string, c context.Context) (string, bool) {
	ctx, cancel := context.WithTimeout(c, 10*time.Second)
	defer cancel()
	var gmail string
	result := db.db.Model(&models.UserDataBase{}).WithContext(ctx).Select("gmail").Where("gmail = ?", email).Scan(&gmail)
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return "", false
		}
		return "", false
	}
	if gmail == "" {
		return "", false
	}
	return gmail, true
}

// GetPassword devuelve el hash de contraseña del usuario; segundo valor indica si fue encontrado.
func (db *RepositoriesUser) GetPassword(username string, c context.Context) (string, bool) {
	ctx, cancel := context.WithTimeout(c, 10*time.Second)
	defer cancel()
	var password string
	result := db.db.Model(&models.UserDataBase{}).WithContext(ctx).Select("password").Where("username = ?", username).Scan(&password)
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return "", false
		}
		return "", false
	}
	return password, true
}

// GetActivo devuelve el estado 'activo' del usuario; segundo valor indica si fue encontrado.
func (db *RepositoriesUser) GetActivo(username string, c context.Context) (bool, bool) {
	ctx, cancel := context.WithTimeout(c, 10*time.Second)
	defer cancel()
	var activo bool
	result := db.db.Model(&models.UserDataBase{}).WithContext(ctx).Select("activo").Where("username = ?", username).Scan(&activo)
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return false, false
		}
		return false, false
	}
	return activo, true
}

// ActivateAccount marca la cuenta del usuario como activa en la BD.
func (db *RepositoriesUser) ActivateAccount(username string, c context.Context) error {
	ctx, cancel := context.WithTimeout(c, 10*time.Second)
	defer cancel()
	return db.db.Model(&models.UserDataBase{}).WithContext(ctx).Where("username = ?", username).Update("activo", true).Error
}

// ChangePassword actualiza la contraseña del usuario.
func (db *RepositoriesUser) ChangePassword(username string, newPassword string, c context.Context) error {
	ctx, cancel := context.WithTimeout(c, 10*time.Second)
	defer cancel()
	return db.db.Model(&models.UserDataBase{}).WithContext(ctx).Where("username = ?", username).Update("password", newPassword).Error
}

// GetBlocked devuelve el estado 'bloqueado' del usuario; segundo valor indica si fue encontrado.
func (db *RepositoriesUser) GetBlocked(username string, c context.Context) (bool, bool) {
	ctx, cancel := context.WithTimeout(c, 10*time.Second)
	defer cancel()
	var bloqueado bool
	result := db.db.Model(&models.UserDataBase{}).WithContext(ctx).Select("bloqueado").Where("username = ?", username).Scan(&bloqueado)
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return false, false
		}
		return false, false
	}
	return bloqueado, true
}

// GetTelephonByUsername obtiene el número de teléfono del usuario por su username.
func (db *RepositoriesUser) GetTelephonByUsername(username string, c context.Context) (string, bool) {
	ctx, cancel := context.WithTimeout(c, 10*time.Second)
	defer cancel()
	var telephon string
	result := db.db.Model(&models.UserDataBase{}).WithContext(ctx).Select("telephon").Where("username = ?", username).Scan(&telephon)
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return "", false
		}
		return "", false
	}
	if telephon == "" {
		return "", false
	}
	return telephon, true
}

// GetUsernameByEmail busca el username asociado a un email.
func (db *RepositoriesUser) GetUsernameByEmail(email string, c context.Context) (string, bool) {
	ctx, cancel := context.WithTimeout(c, 10*time.Second)
	defer cancel()
	var username string
	result := db.db.Model(&models.UserDataBase{}).WithContext(ctx).Select("username").Where("gmail = ?", email).Scan(&username)
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return "", false
		}
		return "", false
	}
	return username, true
}

// TelephonExist comprueba si ya existe un usuario con ese número de teléfono.
func (db *RepositoriesUser) TelephonExist(telephon string, c context.Context) bool {
	ctx, cancel := context.WithTimeout(c, 10*time.Second)
	defer cancel()
	var telephonDB string
	result := db.db.Model(&models.UserDataBase{}).WithContext(ctx).Select("telephon").Where("telephon = ?", telephon).Scan(&telephonDB)
	log.Println("[REPO] Buscando telefono:", telephon)
	log.Println("[REPO] Resultado de búsqueda:", telephonDB)
	log.Println("[REPO] Error:", result.Error)
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			log.Println("[REPO] Telefono NO existe")
			return false
		}
		log.Println("[REPO] Error en query:", result.Error)
		return false
	}
	if telephonDB == "" {
		log.Println("[REPO] Telefono NO existe (vacío)")
		return false
	}
	log.Println("[REPO] Telefono EXISTE")
	return true
}

// BlockUser establece 'bloqueado=true' para el usuario indicado.
func (db *RepositoriesUser) BlockUser(username string, c context.Context) error {
	ctx, cancel := context.WithTimeout(c, 10*time.Second)
	defer cancel()
	return db.db.Model(&models.UserDataBase{}).WithContext(ctx).Where("username = ?", username).Update("bloqueado", true).Error
}

// UnblockUserByEmail desbloquea al usuario asociado al email.
func (db *RepositoriesUser) UnblockUserByEmail(email string, c context.Context) error {
	ctx, cancel := context.WithTimeout(c, 10*time.Second)
	defer cancel()
	return db.db.Model(&models.UserDataBase{}).WithContext(ctx).Where("gmail = ?", email).Update("bloqueado", false).Error
}

// UnblockUserByEmailTx desbloquea usuario dentro de una transacción
func (db *RepositoriesUser) UnblockUserByEmailTx(tx *gorm.DB, email string, c context.Context) error {
	ctx, cancel := context.WithTimeout(c, 10*time.Second)
	defer cancel()
	return tx.Model(&models.UserDataBase{}).WithContext(ctx).Where("gmail = ?", email).Update("bloqueado", false).Error
}

// ChangePasswordByEmail actualiza la contraseña del usuario buscando por email.
func (db *RepositoriesUser) ChangePasswordByEmail(email string, newPassword string, c context.Context) error {
	ctx, cancel := context.WithTimeout(c, 10*time.Second)
	defer cancel()
	return db.db.Model(&models.UserDataBase{}).WithContext(ctx).Where("gmail = ?", email).Update("password", newPassword).Error
}

// ChangePasswordByEmailTx cambia contraseña dentro de una transacción
func (db *RepositoriesUser) ChangePasswordByEmailTx(tx *gorm.DB, email string, newPassword string, c context.Context) error {
	ctx, cancel := context.WithTimeout(c, 10*time.Second)
	defer cancel()
	return tx.Model(&models.UserDataBase{}).WithContext(ctx).Where("gmail = ?", email).Update("password", newPassword).Error
}
