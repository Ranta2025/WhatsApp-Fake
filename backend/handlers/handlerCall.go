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

func InitHandlerCall(service services.CallServicer) *HandlerCall {
	return &HandlerCall{service: service}
}

func (hc *HandlerCall) GenerateToken() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exist := ctx.Get("telephon")
		roomID, exist2 := ctx.Get("roomID")
		if !exist || !exist2 {
			respondErrorMsg(ctx, http.StatusBadRequest, "error al obtener los datos")
			return
		}

		appIDStr := os.Getenv("ZEGO_APP_ID")
		serverSecret := os.Getenv("ZEGO_SERVER_SECRET")
		if appIDStr == "" || serverSecret == "" {
			respondErrorMsg(ctx, http.StatusInternalServerError, "Credenciales de ZegoCloud no configuradas")
			return
		}

		appID, err := strconv.ParseUint(appIDStr, 10, 32)
		if err != nil {
			respondErrorMsg(ctx, http.StatusInternalServerError, "AppID inválido")
			return
		}

		userID := telephon.(string)
		token, err := token04.GenerateToken04(uint32(appID), userID, serverSecret, 3600, "")
		if err != nil {
			respondErrorMsg(ctx, http.StatusInternalServerError, "Error al generar el token de llamada")
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

func (hc *HandlerCall) GetCallHistory() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exist := ctx.Get("telephon")
		if !exist {
			respondErrorMsg(ctx, http.StatusUnauthorized, "No autorizado")
			return
		}

		c := ctx.Request.Context()
		calls, err := hc.service.GetCallHistory(telephon.(string), c)
		if err != nil {
			respondErrorMsg(ctx, http.StatusInternalServerError, "Error al obtener historial de llamadas")
			return
		}

		ctx.JSON(http.StatusOK, gin.H{"calls": calls})
	}
}

func (hc *HandlerCall) DeleteCallLog() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exist := ctx.Get("telephon")
		callID, exist2 := ctx.Get("callID")
		if !exist || !exist2 {
			respondErrorMsg(ctx, http.StatusBadRequest, "error al obtener los datos")
			return
		}

		c := ctx.Request.Context()
		if err := hc.service.DeleteCallForUser(callID.(uint), telephon.(string), c); err != nil {
			respondErrorMsg(ctx, http.StatusInternalServerError, "Error al eliminar registro de llamada")
			return
		}

		ctx.JSON(http.StatusOK, gin.H{"message": "Registro eliminado"})
	}
}
