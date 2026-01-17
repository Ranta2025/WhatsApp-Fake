package repos

import (
	"gorm/models"

	"gorm.io/gorm"
)

type RepositoriesUser struct {
	db *gorm.DB
}

func GetRespositorieUser(db *gorm.DB) *RepositoriesUser {
	return &RepositoriesUser{db: db}
}

func (db *RepositoriesUser) CreateUser(user models.UserDataBase) error {
	return db.db.Model(models.UserDataBase{}).Create(&user).Error
}

func (db *RepositoriesUser) UsernameExist(username string) (models.UserDataBase ,bool) {
	var user models.UserDataBase
	result := db.db.Where("username = ?", username).First(&user)
	if result.Error != nil || result.RowsAffected == 0 {
		return user, false
	}
	return user, true
}

func (db *RepositoriesUser) EmailExist(email string) (models.UserDataBase, bool) {
	var user models.UserDataBase
	result := db.db.Where("gmail = ?", email).First(&user)
	if result.Error != nil || result.RowsAffected == 0 {
		return user, false
	}
	return user, true
}