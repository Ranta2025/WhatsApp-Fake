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

func (db *RepositoriesUser) UsernameExist(username string ,c context.Context) (models.UserDataBase ,bool) {
	ctx, cancel := context.WithTimeout(c, 10 * time.Second)
	defer cancel()
	var user models.UserDataBase
	result := db.db.WithContext(ctx).Where("username = ?", username).First(&user)
	if result.Error != nil || result.RowsAffected == 0 {
		return user, false
	}
	return user, true
}

func (db *RepositoriesUser) EmailExist(email string, c context.Context) (models.UserDataBase, bool) {
	ctx, cancel := context.WithTimeout(c, 10 * time.Second)
	defer cancel()
	var user models.UserDataBase
	result := db.db.WithContext(ctx).Where("gmail = ?", email).First(&user)
	if result.Error != nil || result.RowsAffected == 0 {
		return user, false
	}
	return user, true
}