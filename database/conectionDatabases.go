package database

import (
	"go.mongodb.org/mongo-driver/mongo"
	"gorm.io/gorm"
)

func GetConection() (*gorm.DB, *mongo.Client, error){
	data, err := Conection()
	if err != nil {
		return nil,nil,err
	}
	client, err := ConnectMongo()
	if err != nil {
		return nil, nil, err
	}
	return data, client , nil
}