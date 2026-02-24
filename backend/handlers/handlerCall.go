package handlers

import (
	"gorm/backend/services"
	"net/http"
	"os"
	"strconv"

	"github.com/ZEGOCLOUD/zego_server_assistant/token/go/src/token04"
	"github.com/gin-gonic/gin"
)

type HandlerCall struct {
	service *services.ServiceCall
}

func InitHandlerCall(service *services.ServiceCall) *HandlerCall {
	return &HandlerCall{service: service}
}

func (hc *HandlerCall) GenerateToken() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		// Obtener el teléfono del usuario autenticado
		telephon, exist := ctx.Get("telephon")
		if !exist {
			ctx.JSON(http.StatusUnauthorized, gin.H{"error": "No autorizado"})
			return
		}

		// Obtener el roomID de los parámetros de la URL
		roomID := ctx.Param("roomID")
		if roomID == "" {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "roomID es requerido"})
			return
		}

		// Leer credenciales de ZegoCloud desde el entorno
		appIDStr := os.Getenv("ZEGO_APP_ID")
		serverSecret := os.Getenv("ZEGO_SERVER_SECRET")

		if appIDStr == "" || serverSecret == "" {
			ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Credenciales de ZegoCloud no configuradas"})
			return
		}

		appID, err := strconv.ParseUint(appIDStr, 10, 32)
		if err != nil {
			ctx.JSON(http.StatusInternalServerError, gin.H{"error": "AppID inválido"})
			return
		}

		// Configurar el token
		userID := telephon.(string)           // Usamos el teléfono como userID en ZegoCloud
		effectiveTimeInSeconds := int64(3600) // El token dura 1 hora

		// Generar el token usando el SDK de ZegoCloud
		token, err := token04.GenerateToken04(uint32(appID), userID, serverSecret, effectiveTimeInSeconds, "")
		if err != nil {
			ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Error al generar el token de llamada"})
			return
		}

		ctx.JSON(http.StatusOK, gin.H{
			"token":  token,
			"appID":  appID,
			"userID": userID,
			"roomID": roomID,
		})
	}
}

// GetCallHistory obtiene el historial de llamadas del usuario autenticado
func (hc *HandlerCall) GetCallHistory() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exist := ctx.Get("telephon")
		if !exist {
			ctx.JSON(http.StatusUnauthorized, gin.H{"error": "No autorizado"})
			return
		}

		c := ctx.Request.Context()
		calls, err := hc.service.GetCallHistory(telephon.(string), c)
		if err != nil {
			ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Error al obtener historial de llamadas"})
			return
		}

		ctx.JSON(http.StatusOK, gin.H{"calls": calls})
	}
}

// DeleteCallLog elimina un registro de llamada para el usuario autenticado
func (hc *HandlerCall) DeleteCallLog() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exist := ctx.Get("telephon")
		if !exist {
			ctx.JSON(http.StatusUnauthorized, gin.H{"error": "No autorizado"})
			return
		}

		idStr := ctx.Param("id")
		id, err := strconv.ParseUint(idStr, 10, 64)
		if err != nil {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
			return
		}

		c := ctx.Request.Context()
		if err := hc.service.DeleteCallForUser(uint(id), telephon.(string), c); err != nil {
			ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Error al eliminar registro de llamada"})
			return
		}

		ctx.JSON(http.StatusOK, gin.H{"message": "Registro eliminado"})
	}
}
