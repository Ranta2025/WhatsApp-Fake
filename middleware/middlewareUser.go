package middleware

import (
	"fmt"
	"gorm/utils"
)

func MiddlewareLogOut(username string, gmail string, password string) bool {
	if !utils.ValidationLenUsername(username) {
		fmt.Println("El usuario tiene que tener mas de 5 caracteres")
		return false
	}

	if !utils.ValidationGmail(gmail) {
		fmt.Println("Email invalido") 
		return false
	}

	if !utils.ValidationPasswordLen(password) {
		fmt.Println("La contrasena tiene que contener mas de 8 caracteres")
		return false
	}

	if !utils.ValidationPasswordNumber(password) {
		fmt.Println("La contrasena tiene que contener algun numero")
		return false
	}

	if !utils.ValidationPasswordCharacterSpecial(password) {
		fmt.Println("La contrasena tiene que contener algun caracter especial")
		return false
	}

	if !utils.ValidationPasswordUpper(password) {
		fmt.Println("La contrasena tiene que contener alguna mayuscula")
		return false
	}
	return true
}