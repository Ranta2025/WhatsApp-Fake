package middleware

import (
	"gorm/backend/models"

	"github.com/gin-gonic/gin"
)

func MiddlewareChat() gin.HandlerFunc {
	return func(c *gin.Context) {
		var messaje models.MessageGet
		if err := c.ShouldBindJSON(&messaje); err != nil {
			c.JSON(400, gin.H{
				"error": "Error al bindear el mensaje",
			})
			c.Abort()
			return
		}

		if len(messaje.Receptor) == 0 {
			c.JSON(400, gin.H{
				"error": "El receptor no puede estar vacio",
			})
			c.Abort()
			return
		}

		if len(messaje.Message) == 0 {
			c.JSON(400, gin.H{
				"error": "El mensaje no puede estar vacio",
			})
			c.Abort()
			return
		}

		c.Set("message", messaje)
		c.Next()
	}
}


func MiddlewateGetChat() gin.HandlerFunc {
	return func(c *gin.Context) {
		contact := c.Param("contact")
		if len(contact) == 0 {
			c.JSON(400, gin.H{
				"error": "El contacto no puede estar vacio",
			})
			c.Abort()
			return
		}

		c.Set("contact", contact)
		c.Next()
	}
}

func MiddlewareChatPutStatus() gin.HandlerFunc {
	return func(c *gin.Context) {
		contact := c.Param("contact")
		if len(contact) == 0 {
			c.JSON(400, gin.H{
				"error": "El contacto no puede estar vacio",
			})
			c.Abort()
			return
		}

		c.Set("contact", contact)
		c.Next()
	}
}