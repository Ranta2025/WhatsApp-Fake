package middleware

import (
	"gorm/backend/models"
	"net/http"
	"strings"

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
		if strings.TrimSpace(report.Title) == "" {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "El título del reporte no puede estar vacío"})
			ctx.Abort()
			return
		}
		if len(report.Title) > 200 {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "El título no puede superar los 200 caracteres"})
			ctx.Abort()
			return
		}
		total := len(report.Description) + len(report.Steps) + len(report.Expected) + len(report.Actual) +
			len(report.UserEmail) + len(report.Browser) + len(report.OS) + len(report.ScreenSize)
		if total > 20000 {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "El reporte es demasiado largo"})
			ctx.Abort()
			return
		}
		ctx.Set("bugReport", report)
		ctx.Next()
	}
}
