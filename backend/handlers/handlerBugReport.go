package handlers

import (
	"gorm/backend/models"
	"gorm/backend/services"
	"net/http"

	"github.com/gin-gonic/gin"
)

type HandlerBugReport struct {
	service services.BugReportServicer
}

// InitHandlerBugReport crea el handler de reportes de bugs con su servicio.
func InitHandlerBugReport(service services.BugReportServicer) *HandlerBugReport {
	return &HandlerBugReport{
		service: service,
	}
}

// HandleReportBug recibe un reporte de bug desde el cliente y crea un Issue en GitHub.
// Los datos vienen validados por MiddlewareBugReport.
func (h *HandlerBugReport) HandleReportBug() gin.HandlerFunc {
	return func(c *gin.Context) {
		reportInterface, exist := c.Get("bugReport")
		if !exist {
			c.JSON(http.StatusBadRequest, gin.H{"error": "error al obtener los datos del reporte"})
			return
		}

		report := reportInterface.(models.BugReport)
		if err := h.service.CreateGitHubIssue(report); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error":   "Error al crear el issue en GitHub",
				"message": err.Error(),
			})
			return
		}

		c.JSON(http.StatusCreated, gin.H{
			"success": true,
			"message": "Bug reportado exitosamente. ¡Gracias por tu ayuda!",
		})
	}
}
