package database

import (
	"github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/mongo"
	"gorm.io/gorm"
)

func GetConection() (*gorm.DB, *mongo.Client, *redis.Client, error){
	data, err := Conection()
	if err != nil {
		return nil,nil,nil, err
	}
	client, err := ConnectMongo()
	if err != nil {
		return nil, nil, nil, err
	}

	rd, err := GetRedis()
	if err != nil{
		return nil,nil,nil,err
	}
	return data, client , rd, nil
}