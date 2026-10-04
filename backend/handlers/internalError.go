package handlers

import (
	"net/http"

	"gorm/backend/logging"
	"gorm/backend/utils"

	"github.com/gin-gonic/gin"
)

// internalErrorMessage es el único texto que ve el cliente ante un fallo interno.
const internalErrorMessage = "Ocurrió un error interno, inténtalo de nuevo"

// respondInternal responde 500 con un mensaje genérico y deja la causa real en
// el log del servidor, enlazada con el request id (X-Request-ID) para poder
// correlacionarla con lo que reporte el usuario. Nunca incluye err en la respuesta.
func respondInternal(ctx *gin.Context, err error) {
	var base = ctx.Request
	attrs := []any{"err", err}
	if base != nil {
		attrs = append(attrs, "method", base.Method, "path", ctx.FullPath())
		logging.FromContext(base.Context()).Error("error interno", attrs...)
	} else {
		logging.FromContext(ctx).Error("error interno", attrs...)
	}
	ctx.JSON(http.StatusInternalServerError, gin.H{"error": internalErrorMessage})
}

// respondFailure responde con el status dado y el mensaje del error (mensajes
// escritos a mano por los servicios o sentinels de dominio), salvo que err sea
// un fallo de infraestructura (db, conexión, timeout): entonces es un 500
// genérico vía respondInternal.
func respondFailure(ctx *gin.Context, status int, err error) {
	if utils.IsInternalError(err) {
		respondInternal(ctx, err)
		return
	}
	ctx.JSON(status, gin.H{"error": err.Error()})
}

// respondChatError traduce un error del servicio de chat a su respuesta: 404,
// 400 y 409 para los sentinels conocidos (su texto es seguro) y 500 genérico
// para todo lo demás.
func respondChatError(ctx *gin.Context, err error) {
	status := chatErrorStatus(err)
	if status == http.StatusInternalServerError {
		respondInternal(ctx, err)
		return
	}
	ctx.JSON(status, gin.H{"error": err.Error()})
}
