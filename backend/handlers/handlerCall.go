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
	service services.CallServicer
}

// InitHandlerCall crea el handler de llamadas con su servicio.
func InitHandlerCall(service services.CallServicer) *HandlerCall {
	return &HandlerCall{service: service}
}

// GenerateToken genera un token temporal de ZegoCloud para el usuario autenticado
// en la sala indicada por el parámetro :roomID. Se usa para iniciar llamadas de voz/video.
func (hc *HandlerCall) GenerateToken() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exist := ctx.Get("telephon")
		roomID, exist2 := ctx.Get("roomID")
		if !exist || !exist2 {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "error al obtener los datos"})
			return
		}

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

		userID := telephon.(string)
		token, err := token04.GenerateToken04(uint32(appID), userID, serverSecret, 3600, "")
		if err != nil {
			ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Error al generar el token de llamada"})
			return
		}

		ctx.JSON(http.StatusOK, gin.H{
			"token":  token,
			"appID":  appID,
			"userID": userID,
			"roomID": roomID.(string),
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

// DeleteCallLog elimina un registro de llamada para el usuario autenticado.
// El ID viene validado por MiddlewareDeleteCallLog.
func (hc *HandlerCall) DeleteCallLog() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exist := ctx.Get("telephon")
		callID, exist2 := ctx.Get("callID")
		if !exist || !exist2 {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "error al obtener los datos"})
			return
		}

		c := ctx.Request.Context()
		if err := hc.service.DeleteCallForUser(callID.(uint), telephon.(string), c); err != nil {
			ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Error al eliminar registro de llamada"})
			return
		}

		ctx.JSON(http.StatusOK, gin.H{"message": "Registro eliminado"})
	}
}
