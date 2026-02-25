package middleware

import (
	"fmt"
	"gorm/backend/models"

	"github.com/gin-gonic/gin"
)

// MiddlewareChat valida el cuerpo de una petición de nuevo mensaje:
// receptor no vacío y texto o archivo adjunto.
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

		// Debe tener texto O archivo adjunto (no ambos vacíos)
		if len(messaje.Message) == 0 && len(messaje.MediaUrl) == 0 {
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

// MiddlewateGetChat extrae el parámetro :contact de la URL para las peticiones
// de historial de mensajes.
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

// MiddlewareChatEdit valida el cuerpo de una petición de edición de mensaje:
// ID de mensaje y texto nuevo no vacíos.
func MiddlewareChatEdit() gin.HandlerFunc {
	return func(c *gin.Context) {
		var messaje models.MessageEdit
		if err := c.ShouldBindJSON(&messaje); err != nil {
			c.JSON(400, gin.H{
				"error": "Error al bindear el mensaje",
			})
			c.Abort()
			return
		}

		if messaje.MessageID == 0 {
			c.JSON(400, gin.H{
				"error": "El ID del mensaje no puede estar vacio",
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

		c.Set("messageEdit", messaje)
		c.Next()
	}
}

// MiddlewareClearChat extrae el parámetro :contact de la URL para borrar el chat.
func MiddlewareClearChat() gin.HandlerFunc {
	return func(c *gin.Context) {
		contact := c.Param("contact")
		if len(contact) == 0 {
			c.JSON(400, gin.H{"error": "El contacto no puede estar vacío"})
			c.Abort()
			return
		}
		c.Set("contact", contact)
		c.Next()
	}
}

// MiddlewareDeleteMessage extrae y valida el parámetro :id de la URL (uint).
func MiddlewareDeleteMessage() gin.HandlerFunc {
	return func(c *gin.Context) {
		idStr := c.Param("id")
		if len(idStr) == 0 {
			c.JSON(400, gin.H{"error": "El id del mensaje es requerido"})
			c.Abort()
			return
		}
		var id uint64
		_, err := fmt.Sscanf(idStr, "%d", &id)
		if err != nil || id == 0 {
			c.JSON(400, gin.H{"error": "id de mensaje inválido"})
			c.Abort()
			return
		}
		c.Set("messageID", uint(id))
		c.Next()
	}
}

// MiddlewareChatPutStatus extrae el parámetro :contact de la URL para las
// peticiones de actualización de estado de mensajes.
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
