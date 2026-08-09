package middleware

import (
	"fmt"
	"gorm/backend/models"
	"net/http"

	"github.com/gin-gonic/gin"
)

func RequireJSON() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Method == "GET" || c.Request.Method == "DELETE" {
			c.Next()
			return
		}
		ct := c.ContentType()
		if ct != "" && ct != "application/json" {
			c.AbortWithStatusJSON(http.StatusUnsupportedMediaType, gin.H{"error": "Content-Type must be application/json"})
			return
		}
		c.Next()
	}
}

func MiddlewareChat() gin.HandlerFunc {
	return func(c *gin.Context) {
		var messaje models.MessageGet
		if err := c.ShouldBindJSON(&messaje); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Error al bindear el mensaje",
			})
			c.Abort()
			return
		}

		if len(messaje.Receptor) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "El receptor no puede estar vacio",
			})
			c.Abort()
			return
		}

		if len(messaje.Message) == 0 && len(messaje.MediaUrl) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "El mensaje no puede estar vacio",
			})
			c.Abort()
			return
		}

		c.Set("message", messaje)
		c.Next()
	}
}

func MiddlewareGetChat() gin.HandlerFunc {
	return func(c *gin.Context) {
		contact := c.Param("contact")
		if len(contact) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "El contacto no puede estar vacio",
			})
			c.Abort()
			return
		}

		c.Set("contact", contact)
		c.Next()
	}
}

func MiddlewareChatEdit() gin.HandlerFunc {
	return func(c *gin.Context) {
		var messaje models.MessageEdit
		if err := c.ShouldBindJSON(&messaje); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Error al bindear el mensaje",
			})
			c.Abort()
			return
		}

		if messaje.MessageID == 0 {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "El ID del mensaje no puede estar vacio",
			})
			c.Abort()
			return
		}

		if len(messaje.Message) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "El mensaje no puede estar vacio",
			})
			c.Abort()
			return
		}

		c.Set("messageEdit", messaje)
		c.Next()
	}
}

func MiddlewareClearChat() gin.HandlerFunc {
	return func(c *gin.Context) {
		contact := c.Param("contact")
		if len(contact) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "El contacto no puede estar vacío"})
			c.Abort()
			return
		}
		c.Set("contact", contact)
		c.Next()
	}
}

func MiddlewareDeleteMessage() gin.HandlerFunc {
	return func(c *gin.Context) {
		idStr := c.Param("id")
		if len(idStr) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "El id del mensaje es requerido"})
			c.Abort()
			return
		}
		var id uint64
		_, err := fmt.Sscanf(idStr, "%d", &id)
		if err != nil || id == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "id de mensaje inválido"})
			c.Abort()
			return
		}
		c.Set("messageID", uint(id))
		c.Next()
	}
}

func MiddlewareChatPutStatus() gin.HandlerFunc {
	return func(c *gin.Context) {
		contact := c.Param("contact")
		if len(contact) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "El contacto no puede estar vacio",
			})
			c.Abort()
			return
		}

		c.Set("contact", contact)
		c.Next()
	}
}
