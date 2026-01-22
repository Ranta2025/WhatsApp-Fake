package repos

import (
	"context"
	"gorm/schemas"
	"log"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/mongo"
	"gorm.io/gorm"
)

type ApiMessage struct {
	mongo *mongo.Client
	data  *gorm.DB
}

func InitRepoApiMessage(mongo *mongo.Client, data *gorm.DB) *ApiMessage {
	return &ApiMessage{
		mongo: mongo,
		data:  data,
	}
}

func (ap *ApiMessage) GetUserDataBase(username string, ctx context.Context) (*schemas.UserGet, error) {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	log.Println("Buscando usuario:", username)
	var user schemas.UserGet
	result := ap.data.WithContext(c).
		Table("user_data_bases").
		Where("username = ?", strings.TrimSpace(username)).
		Select("username", "telephon", "gmail").
		Scan(&user)
	if result.Error != nil {
		log.Println("Error en query:", result.Error)
		return nil, result.Error
	}
	log.Println("Usuario encontrado:", user)
	return &user, nil
}
