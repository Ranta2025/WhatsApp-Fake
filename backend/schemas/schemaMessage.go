package schemas

import "time"

type Message struct {
	Username string
	Receptor string
	Message  string
	Status   string
	Time     time.Time
}