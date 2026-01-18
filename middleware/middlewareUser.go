package middleware

import (
	"fmt"
	"gorm/models"
	"gorm/utils"

	"github.com/gin-gonic/gin"
)

func MiddlewareLogOut() gin.HandlerFunc {
	return func(c *gin.Context) {
		var user models.UserDataBase
		c.BindJSON(&user)
		if !utils.ValidationLenUsername(user.Username) {
			fmt.Println("El usuario tiene que tener mas de 5 caracteres")
			return
		}

		if !utils.ValidationGmail(user.Gmail) {
			fmt.Println("Email invalido")
			return 
		}

		if !utils.ValidationPasswordLen(user.Password) {
			fmt.Println("La contrasena tiene que contener mas de 8 caracteres")
			return
		}

		if !utils.ValidationPasswordNumber(user.Password) {
			fmt.Println("La contrasena tiene que contener algun numero")
			return
		}

		if !utils.ValidationPasswordCharacterSpecial(user.Password) {
			fmt.Println("La contrasena tiene que contener algun caracter especial")
			return
		}

		if !utils.ValidationPasswordUpper(user.Password) {
			fmt.Println("La contrasena tiene que contener alguna mayuscula")
			return 
		}
		
	}
}
