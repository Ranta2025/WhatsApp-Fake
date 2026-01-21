package repos

import "go.mongodb.org/mongo-driver/mongo"

type ApiMessage struct {
	mongo *mongo.Client
}

func InitRepoApiMessage(mongo *mongo.Client) *ApiMessage{
	return &ApiMessage{
		mongo: mongo,
	}
}