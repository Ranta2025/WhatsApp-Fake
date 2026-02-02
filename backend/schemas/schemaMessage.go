package schemas

import "time"

type Message struct {
	MessageID uint
	Username  string
	Receptor  string
	Message   string
	Status    string
	Time      time.Time
}
