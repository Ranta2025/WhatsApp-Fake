package database

import (
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

func GetConection() (*gorm.DB, *redis.Client, error){
	data, err := Conection()
	if err != nil {
		return nil,nil, err
	}
	

	rd, err := GetRedis()
	if err != nil{
		return nil,nil,err
	}
	return data, rd, nil
}