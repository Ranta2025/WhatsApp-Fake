package middleware

import (
	"gorm/backend/models"
	"net/http"

	"github.com/gin-gonic/gin"
)

// MiddlewareBugReport valida el JSON del reporte de bug:
// título y descripción no vacíos.
func MiddlewareBugReport() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		var report models.BugReport
		if err := ctx.ShouldBindJSON(&report); err != nil {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "Datos inválidos: " + err.Error()})
			ctx.Abort()
			return
		}
		if len(report.Title) == 0 {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "El título del reporte no puede estar vacío"})
			ctx.Abort()
			return
		}
		ctx.Set("bugReport", report)
		ctx.Next()
	}
}
