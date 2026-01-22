package repos

import (
	"context"
	"gorm/models"
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
	ctx, cancel := context.WithTimeout(c, 10 * time.Second)
	defer cancel()
	return db.db.Model(models.UserDataBase{}).WithContext(ctx).Create(&user).Error
}

func (db *RepositoriesUser) UsernameExist(username string ,c context.Context) (bool) {
	ctx, cancel := context.WithTimeout(c, 10 * time.Second)
	defer cancel()
	var usernameDB string
	result := db.db.WithContext(ctx).Select("username").Where("username = ?", username).First(&usernameDB)
	if result.Error != nil || result.RowsAffected == 0 {
		return false
	}
	return true
}

func (db *RepositoriesUser) EmailExist(email string, c context.Context) (string, bool) {
	ctx, cancel := context.WithTimeout(c, 10 * time.Second)
	defer cancel()
	var gmail string
	result := db.db.WithContext(ctx).Select("gmail").Where("gmail = ?", email).First(&gmail)
	if result.Error != nil || result.RowsAffected == 0 {
		return "", false
	}
	return gmail, true
}

func (db *RepositoriesUser) GetPassword(email string, c context.Context) (string, bool) {
	ctx, cancel := context.WithTimeout(c, 10 * time.Second)
	defer cancel()
	var password string
	result := db.db.WithContext(ctx).Select("password").Where("gmail = ?", email).First(&password)
	if result.Error != nil || result.RowsAffected == 0 {
		return "", false
	}
	return password, true
}