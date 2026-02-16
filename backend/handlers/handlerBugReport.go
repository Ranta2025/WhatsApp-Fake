package handlers

import (
	"gorm/backend/models"
	"gorm/backend/services"
	"net/http"

	"github.com/gin-gonic/gin"
)

type HandlerBugReport struct {
	service *services.ServiceBugReport
}

func InitHandlerBugReport(service *services.ServiceBugReport) *HandlerBugReport {
	return &HandlerBugReport{
		service: service,
	}
}

func (h *HandlerBugReport) HandleReportBug() gin.HandlerFunc {
	return func(c *gin.Context) {
		var report models.BugReport

		// Validar el JSON recibido
		if err := c.ShouldBindJSON(&report); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"error":   "Datos inválidos",
				"message": err.Error(),
			})
			return
		}

		// Enviar el reporte a GitHub
		if err := h.service.CreateGitHubIssue(report); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error":   "Error al crear el issue en GitHub",
				"message": err.Error(),
			})
			return
		}

		// Respuesta exitosa
		c.JSON(http.StatusCreated, gin.H{
			"success": true,
			"message": "Bug reportado exitosamente. ¡Gracias por tu ayuda!",
		})
	}
}
