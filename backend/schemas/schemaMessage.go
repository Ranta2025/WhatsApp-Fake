package schemas

import "time"

type Message struct {
	MessageID uint      `json:"MessageID"`
	Username  string    `json:"Username"`
	Receptor  string    `json:"Receptor"`
	Message   string    `json:"Message"`
	Status    string    `json:"Status"`
	Time      time.Time `json:"Time"`
}
