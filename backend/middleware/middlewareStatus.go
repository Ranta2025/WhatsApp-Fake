package middleware

import (
	"gorm/backend/models"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// MiddlewareStatusCreate valida el cuerpo de una petición de publicación de estado:
// solo exige que el tipo venga presente, el resto (longitudes, color, URL) lo
// valida el servicio, que además conoce el máximo real de la columna.
func MiddlewareStatusCreate() gin.HandlerFunc {
	return func(c *gin.Context) {
		var body models.StatusCreate
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Error al bindear el estado"})
			c.Abort()
			return
		}
		c.Set("statusCreate", body)
		c.Next()
	}
}

// MiddlewareStatusID extrae y valida el parámetro :id de la URL (uint) para
// las peticiones de ver, listar espectadores o borrar un estado.
func MiddlewareStatusID() gin.HandlerFunc {
	return func(c *gin.Context) {
		idStr := c.Param("id")
		if len(idStr) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "El id del estado es requerido"})
			c.Abort()
			return
		}
		// ParseUint exige que TODA la cadena sean dígitos (a diferencia de
		// Sscanf("%d"), que aceptaba silenciosamente basura al final, p. ej.
		// "12abc" como id 12) y detecta overflow.
		id, err := strconv.ParseUint(idStr, 10, 63)
		if err != nil || id == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "id de estado inválido"})
			c.Abort()
			return
		}
		c.Set("statusID", uint(id))
		c.Next()
	}
}
