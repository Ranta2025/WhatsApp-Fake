package middleware

import (
	"gorm/backend/models"
	"gorm/backend/utils"
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
		var b models.UserLogin
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
		var b models.Username
		if err := ctx.ShouldBindJSON(&b); err != nil || b.Username == "" {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"message": "complete todos los campos",
			})
			ctx.Abort()
			return
		}

		if !utils.ValidationLenUsername(b.Username) {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"error": "El usuario tiene que tener mas de 5 caracteres",
			})
			ctx.Abort()
			return
		}

		ctx.Set("usernameUpdate", b.Username)
		ctx.Next()
	}
}

func MiddlewareActivateAccount() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		var b models.UserActivate
		if err := ctx.ShouldBindJSON(&b); err != nil || b.Username == "" || b.Code == "" {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"message": "complete todos los campos",
			})
			ctx.Abort()
			return
		}
		ctx.Set("usernameActivate", b)
		ctx.Next()
	}
}

func MiddlewareRecoverAccount() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		var request struct {
			Username string `json:"username"`
		}
		if err := ctx.ShouldBindJSON(&request); err != nil || request.Username == "" {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"message": "complete todos los campos",
			})
			ctx.Abort()
			return
		}
		ctx.Set("userRecover", request.Username)
		ctx.Next()
	}
}

func MiddlewareResendCode() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		var request struct {
			Gmail string `json:"gmail"`
		}
		if err := ctx.ShouldBindJSON(&request); err != nil || request.Gmail == "" {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"message": "complete todos los campos",
			})
			ctx.Abort()
			return
		}
		ctx.Set("gmailResend", request.Gmail)
		ctx.Next()
	}
}

func MiddlewareRecoverCuenta() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		var request models.UserRecover
		if err := ctx.ShouldBindJSON(&request); err != nil || request.Email == "" || request.Code == "" {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"message": "complete todos los campos",
			})
			ctx.Abort()
			return
		}
		ctx.Set("recoverCuenta", request)
		ctx.Next()
	}	
}

func MiddlewareChangePassword() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		var request models.UserChangePassword
		if err := ctx.ShouldBindJSON(&request); err != nil || request.Gmail == "" || request.Password == "" {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"message": "complete todos los campos",
			})
			ctx.Abort()
			return
		}
		if !utils.ValidationPasswordLen(request.Password) {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"error": "La contraseña debe contener mas de 8 caracteres",
			})
			ctx.Abort()
			return
		}
		if !utils.ValidationPasswordNumber(request.Password) {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"error": "La contraseña debe contener algun numero",
			})
			ctx.Abort()
			return
		}
		if !utils.ValidationPasswordCharacterSpecial(request.Password) {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"error": "La contraseña debe contener algun caracter especial",
			})
			ctx.Abort()
			return
		}
		if !utils.ValidationPasswordUpper(request.Password) {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"error": "La contraseña debe contener alguna mayuscula",
			})
			ctx.Abort()
			return
		}
		ctx.Set("changePassword", request)
		ctx.Next()
	}
}

func MiddlewareRecoverAndChangePassword() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		var request models.UserRecoverAndChange
		if err := ctx.ShouldBindJSON(&request); err != nil || request.Email == "" || request.Code == "" || request.Password == "" {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"message": "complete todos los campos",
			})
			ctx.Abort()
			return
		}
		if !utils.ValidationPasswordLen(request.Password) {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"error": "La contraseña debe contener mas de 8 caracteres",
			})
			ctx.Abort()
			return
		}
		if !utils.ValidationPasswordNumber(request.Password) {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"error": "La contraseña debe contener algun numero",
			})
			ctx.Abort()
			return
		}
		if !utils.ValidationPasswordCharacterSpecial(request.Password) {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"error": "La contraseña debe contener algun caracter especial",
			})
			ctx.Abort()
			return
		}
		if !utils.ValidationPasswordUpper(request.Password) {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"error": "La contraseña debe contener alguna mayuscula",
			})
			ctx.Abort()
			return
		}
		ctx.Set("recoverAndChange", request)
		ctx.Next()
	}
}


func MiddlewareSendForgotPasswordCode() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		var request struct {
			Email string `json:\"email\"`
		}
		if err := ctx.ShouldBindJSON(&request); err != nil || request.Email == "" {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"message": "complete todos los campos",
			})
			ctx.Abort()
			return
		}
		ctx.Set("emailForgot", request.Email)
		ctx.Next()
	}
}

func MiddlewareForgotPasswordChange() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		var request models.UserForgotPassword
		if err := ctx.ShouldBindJSON(&request); err != nil || request.Email == "" || request.Code == "" || request.Password == "" {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"message": "complete todos los campos",
			})
			ctx.Abort()
			return
		}
		if !utils.ValidationPasswordLen(request.Password) {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"error": "La contraseña debe contener mas de 8 caracteres",
			})
			ctx.Abort()
			return
		}
		if !utils.ValidationPasswordNumber(request.Password) {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"error": "La contraseña debe contener algun numero",
			})
			ctx.Abort()
			return
		}
		if !utils.ValidationPasswordCharacterSpecial(request.Password) {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"error": "La contraseña debe contener algun caracter especial",
			})
			ctx.Abort()
			return
		}
		if !utils.ValidationPasswordUpper(request.Password) {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"error": "La contraseña debe contener alguna mayuscula",
			})
			ctx.Abort()
			return
		}
		ctx.Set("forgotPassword", request)
		ctx.Next()
	}
}
