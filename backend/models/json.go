package models

type UserLogin struct {
	Username string `json:"username"`
	Password string	`json:"password"`
}

type Username struct{
	Username string `json:"username"`
}

type ContactAdd struct {
	UsernameAdd string `json:"username_add" binding:"required"`
	Answer string 	`json:"answare" binding:"required"`
}

type ContactPut struct {
	ContactAdd
	Username string 
}


type MessageGet struct{
	Receptor string	`json:"receptor" binding:"required"`
	Message string	`json:"message" binding:"required"`
}

type UserActivate struct {
	Username string `json:"username" binding:"required"`
	Code     string `json:"code" binding:"required"`
}

