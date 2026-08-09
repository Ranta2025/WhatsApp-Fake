package middleware

import (
	"strconv"

	"gorm/backend/models"

	"github.com/gin-gonic/gin"
)

// MiddlewareGroupCreate valida que el body sea GroupCreate con nombre y al menos un miembro.
func MiddlewareGroupCreate() gin.HandlerFunc {
	return func(c *gin.Context) {
		var body models.GroupCreate
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(400, gin.H{"error": "Datos inválidos: " + err.Error()})
			c.Abort()
			return
		}
		if len(body.Name) == 0 {
			c.JSON(400, gin.H{"error": "El nombre del grupo no puede estar vacío"})
			c.Abort()
			return
		}
		if len(body.Members) == 0 {
			c.JSON(400, gin.H{"error": "Debes añadir al menos un miembro"})
			c.Abort()
			return
		}
		c.Set("groupCreate", body)
		c.Next()
	}
}

// MiddlewareGroupAddMembers valida que el body sea GroupAddMembers con al menos un teléfono.
func MiddlewareGroupAddMembers() gin.HandlerFunc {
	return func(c *gin.Context) {
		var body models.GroupAddMembers
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(400, gin.H{"error": "Datos inválidos: " + err.Error()})
			c.Abort()
			return
		}
		if len(body.Members) == 0 {
			c.JSON(400, gin.H{"error": "Debes indicar al menos un miembro para añadir"})
			c.Abort()
			return
		}
		c.Set("groupAddMembers", body)
		c.Next()
	}
}

// MiddlewareGroupMessage valida que el body sea GroupMessageSend con contenido no vacío.
func MiddlewareGroupMessage() gin.HandlerFunc {
	return func(c *gin.Context) {
		var body models.GroupMessageSend
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(400, gin.H{"error": "Datos inválidos: " + err.Error()})
			c.Abort()
			return
		}
		if body.GroupID == 0 {
			c.JSON(400, gin.H{"error": "El ID del grupo es obligatorio"})
			c.Abort()
			return
		}
		if len(body.Message) == 0 && len(body.MediaUrl) == 0 {
			c.JSON(400, gin.H{"error": "El mensaje no puede estar vacío"})
			c.Abort()
			return
		}
		c.Set("groupMessage", body)
		c.Next()
	}
}

// MiddlewareGroupMessageEdit valida que el body sea GroupMessageEdit con ID y texto.
func MiddlewareGroupMessageEdit() gin.HandlerFunc {
	return func(c *gin.Context) {
		var body models.GroupMessageEdit
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(400, gin.H{"error": "Datos inválidos: " + err.Error()})
			c.Abort()
			return
		}
		if body.MessageID == 0 {
			c.JSON(400, gin.H{"error": "El ID del mensaje es obligatorio"})
			c.Abort()
			return
		}
		if len(body.Message) == 0 {
			c.JSON(400, gin.H{"error": "El nuevo contenido no puede estar vacío"})
			c.Abort()
			return
		}
		c.Set("groupMessageEdit", body)
		c.Next()
	}
}

// MiddlewareGroupMessageDelete valida que el body sea GroupMessageDelete con un ID válido.
func MiddlewareGroupMessageDelete() gin.HandlerFunc {
	return func(c *gin.Context) {
		var body models.GroupMessageDelete
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(400, gin.H{"error": "Datos inválidos: " + err.Error()})
			c.Abort()
			return
		}
		if body.MessageID == 0 {
			c.JSON(400, gin.H{"error": "El ID del mensaje es obligatorio"})
			c.Abort()
			return
		}
		c.Set("groupMessageDelete", body)
		c.Next()
	}
}

// MiddlewareGroupSetRole valida el body de la operación de cambio de rol.
// Acepta: { "number": "+502...", "role": "admin"|"member" }
func MiddlewareGroupSetRole() gin.HandlerFunc {
	return func(c *gin.Context) {
		var body models.GroupSetRole
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(400, gin.H{"error": "Datos inválidos: " + err.Error()})
			c.Abort()
			return
		}
		if body.Role != "admin" && body.Role != "member" {
			c.JSON(400, gin.H{"error": "El rol debe ser 'admin' o 'member'"})
			c.Abort()
			return
		}
		c.Set("groupSetRole", body)
		c.Next()
	}
}

// MiddlewareGroupRemoveMember valida el body de la operación de eliminación de miembro.
// Acepta: { "number": "+502..." }
func MiddlewareGroupRemoveMember() gin.HandlerFunc {
	return func(c *gin.Context) {
		var body models.GroupRemoveMember
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(400, gin.H{"error": "Datos inválidos: " + err.Error()})
			c.Abort()
			return
		}
		c.Set("groupRemoveMember", body)
		c.Next()
	}
}

// MiddlewareGroupID extrae el parámetro :groupID de la URL y lo convierte a uint.
func MiddlewareGroupID() gin.HandlerFunc {
	return func(c *gin.Context) {
		raw := c.Param("groupID")
		if raw == "" {
			c.JSON(400, gin.H{"error": "El ID del grupo es obligatorio"})
			c.Abort()
			return
		}
		id, err := strconv.ParseUint(raw, 10, 64)
		if err != nil || id == 0 {
			c.JSON(400, gin.H{"error": "El ID del grupo debe ser un número válido"})
			c.Abort()
			return
		}
		c.Set("groupID", uint(id))
		c.Next()
	}
}
