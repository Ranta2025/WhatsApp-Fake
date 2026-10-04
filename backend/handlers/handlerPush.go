package handlers

import (
	"errors"
	"gorm/backend/models"
	"gorm/backend/services"
	"net/http"

	"github.com/gin-gonic/gin"
)

// HandlerPush gestiona los endpoints REST de Web Push: configuración pública
// (clave VAPID), alta/baja de la suscripción del navegador y la preferencia
// de preview del usuario autenticado.
type HandlerPush struct {
	service services.PushServicer
}

// InitHandlerPush crea el handler de Web Push con su servicio.
func InitHandlerPush(service services.PushServicer) *HandlerPush {
	return &HandlerPush{service: service}
}

// respondPushError traduce un error del servicio de push a HTTP: 404 si el
// push está deshabilitado en el servidor (no hay claves VAPID: el recurso
// "no existe"), 409 si el endpoint es de otro usuario con otras claves, 400
// si la suscripción es inválida y 500 genérico para el resto.
func respondPushError(ctx *gin.Context, err error) {
	switch {
	case errors.Is(err, services.ErrPushDisabled):
		ctx.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
	case errors.Is(err, services.ErrPushConflict):
		ctx.JSON(http.StatusConflict, gin.H{"error": err.Error()})
	case errors.Is(err, services.ErrPushInvalid):
		ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	default:
		respondInternal(ctx, err)
	}
}

// noContent responde 204 sin cuerpo (WriteHeaderNow fuerza el envío de la cabecera).
func noContent(ctx *gin.Context) {
	ctx.Status(http.StatusNoContent)
	ctx.Writer.WriteHeaderNow()
}

// HandlerGetPushConfig responde 200 {"enabled","publicKey","preview"}.
// publicKey va vacío si el push está deshabilitado.
func (hd *HandlerPush) HandlerGetPushConfig() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exists := ctx.Get("telephon")
		if !exists {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "error al obtener los datos"})
			return
		}
		cfg, err := hd.service.Config(telephon.(string), ctx)
		if err != nil {
			respondPushError(ctx, err)
			return
		}
		ctx.JSON(http.StatusOK, cfg)
	}
}

// HandlerSubscribe guarda la suscripción validada por MiddlewarePushSubscribe:
// 201 si es nueva para el usuario, 200 si el endpoint ya era suyo.
func (hd *HandlerPush) HandlerSubscribe() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exists := ctx.Get("telephon")
		bodyRaw, exists2 := ctx.Get("pushSubscription")
		if !exists || !exists2 {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "error al obtener los datos"})
			return
		}
		created, err := hd.service.Subscribe(telephon.(string), bodyRaw.(models.PushSubscriptionInput), ctx.Request.UserAgent(), ctx)
		if err != nil {
			respondPushError(ctx, err)
			return
		}
		status := http.StatusOK
		if created {
			status = http.StatusCreated
		}
		ctx.JSON(status, gin.H{"subscribed": true})
	}
}

// HandlerUnsubscribe borra la suscripción del usuario con ese endpoint.
// Responde 204 también si no existía (idempotente).
func (hd *HandlerPush) HandlerUnsubscribe() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exists := ctx.Get("telephon")
		endpoint, exists2 := ctx.Get("pushEndpoint")
		if !exists || !exists2 {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "error al obtener los datos"})
			return
		}
		if err := hd.service.Unsubscribe(telephon.(string), endpoint.(string), ctx); err != nil {
			respondPushError(ctx, err)
			return
		}
		noContent(ctx)
	}
}

// HandlerSetPreview guarda la preferencia de preview del usuario (204).
func (hd *HandlerPush) HandlerSetPreview() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exists := ctx.Get("telephon")
		preview, exists2 := ctx.Get("pushPreview")
		if !exists || !exists2 {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "error al obtener los datos"})
			return
		}
		if err := hd.service.SetPreview(telephon.(string), preview.(bool), ctx); err != nil {
			respondPushError(ctx, err)
			return
		}
		noContent(ctx)
	}
}
