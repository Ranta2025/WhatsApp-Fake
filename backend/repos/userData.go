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

func GetRespositorieUser(db *gorm.DB) *RepositoriesUser {
	return &RepositoriesUser{db: db}
}

func (db *RepositoriesUser) CreateUser(user models.UserDataBase, c context.Context) error {
	ctx, cancel := context.WithTimeout(c, 10*time.Second)
	defer cancel()
	user.Activo = true
	return db.db.WithContext(ctx).Create(&user).Error
}

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
	if gmail == ""{
		return "", false
	}
	return gmail, true
}

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

func (db *RepositoriesUser) ActivateAccount(username string, c context.Context) error {
	ctx, cancel := context.WithTimeout(c, 10*time.Second)
	defer cancel()
	return  db.db.Model(&models.UserDataBase{}).WithContext(ctx).Where("username = ?", username).Update("activo", true).Error
}

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
