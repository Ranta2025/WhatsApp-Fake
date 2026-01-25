package middleware

import (
	"gorm/models"
	"gorm/utils"
	"net/http"

	"github.com/gin-gonic/gin"
)

func MiddlewareLogOut() gin.HandlerFunc {
	return func(c *gin.Context) {
		var user models.UserDataBase
		if err := c.ShouldBindJSON(&user); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Complete todos los campos",
			})
			c.Abort()
			return
		}

		if !utils.ValidationLenUsername(user.Username) {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "El usuario tiene que tener mas de 5 caracteres",
			})
			c.Abort()
			return
		}

		if !utils.ValidationGmail(user.Gmail) {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "email invalido",
			})
			c.Abort()
			return
		}

		if len(user.Telephon) != 8 {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "El numero de telefono tiene que contener 8 caracteres",
			})
			c.Abort()
			return
		}

		if !utils.ValidationPasswordLen(user.Password) {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "La contraseña debe contener mas de 8 caracteres",
			})
			c.Abort()
			return
		}

		if !utils.ValidationPasswordNumber(user.Password) {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "La contraseña debe contener algun numero",
			})
			c.Abort()
			return
		}

		if !utils.ValidationPasswordCharacterSpecial(user.Password) {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "La contraseña debe contener algun caracter especial",
			})
			c.Abort()
			return
		}

		if !utils.ValidationPasswordUpper(user.Password) {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "La contraseña debe contener alguna mayuscula",
			})
			c.Abort()
			return
		}

		if user.User.Username == user.Password {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "usuario no puede ser igual a la contraseña",
			})
			c.Abort()
			return
		}
		c.Set("logout", user)
		c.Next()
	}
}

func MiddlewareLogIn() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		type body struct {
			Username string `json:"username"`
			Password string `json:"password"`
		}
		var b body
		if err := ctx.ShouldBindJSON(&b); err != nil {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"error": "complete todos los campos",
			})
			ctx.Abort()
			return
		}

		if b.Username == "" || b.Password == "" {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"error": "complete todos los campos",
			})
			ctx.Abort()
			return
		}
		ctx.Set("username", b.Username)
		ctx.Set("password", b.Password)
	}
}

func MiddlewareUsername() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		type body struct {
			Username string `json:"username"`
		}
		var b body
		if err := ctx.ShouldBindJSON(&b); err != nil || b.Username == "" {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"message": "complete todos los campos",
			})
			ctx.Abort()
			return
		}
		ctx.Set("usernameUpdate", b.Username)
		ctx.Next()
	}
}
