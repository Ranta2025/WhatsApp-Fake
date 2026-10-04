package handlers

import (
	"encoding/json"
	"errors"
	"gorm/backend/models"
	"gorm/backend/services"
	"gorm/backend/websocket"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
)

// HandlerStatus gestiona los endpoints REST del feature de "Estados" (stories)
// y emite los eventos de WebSocket correspondientes a los contactos mutuos.
type HandlerStatus struct {
	service services.StatusServicer
	hub     *websocket.Hub
}

// InitHandlerStatus crea el handler de estados con su servicio y referencia al Hub WebSocket.
func InitHandlerStatus(service services.StatusServicer, hub *websocket.Hub) *HandlerStatus {
	return &HandlerStatus{service: service, hub: hub}
}

// respondStatusError traduce un error del servicio de estados a su respuesta
// HTTP: 400 si es de validación, 403 si es de autorización/ownership, 404 si
// el estado no existe, y 500 genérico (sin filtrar el error crudo) para
// cualquier otra cosa (fallos de infraestructura), que se loggea aparte.
// Los tres primeros casos usan sentinels tipados (services.ErrStatus*), así
// que un fallo de DB nunca se disfraza de 403/404 solo por no ser "not found".
func respondStatusError(ctx *gin.Context, action string, err error) {
	switch {
	case errors.Is(err, services.ErrStatusInvalid):
		ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	case errors.Is(err, services.ErrStatusForbidden):
		ctx.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
	case errors.Is(err, services.ErrStatusNotFound):
		ctx.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
	default:
		log.Printf("[STATUS-HANDLER] Error interno en %s: %v", action, err)
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ocurrió un error interno, inténtalo de nuevo"})
	}
}

// broadcastStatusWS envía msg (ya serializado) a cada teléfono de la lista.
func (hd *HandlerStatus) broadcastStatusWS(telephons []string, msg []byte) {
	if hd.hub == nil {
		return
	}
	for _, tel := range telephons {
		hd.hub.SendTo(tel, msg)
	}
}

// HandlerCreateStatus publica un nuevo estado y lo notifica en tiempo real a
// los contactos mutuos del dueño ("status_new"). Los datos vienen validados
// por MiddlewareStatusCreate (presencia) y por el servicio (reglas de negocio).
func (hd *HandlerStatus) HandlerCreateStatus() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exists := ctx.Get("telephon")
		bodyRaw, exists2 := ctx.Get("statusCreate")
		if !exists || !exists2 {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "error al obtener los datos"})
			return
		}
		body := bodyRaw.(models.StatusCreate)

		item, owner, mutualTelephons, err := hd.service.CreateStatus(telephon.(string), body, ctx)
		if err != nil {
			respondStatusError(ctx, "CreateStatus", err)
			return
		}

		if msg, marshalErr := json.Marshal(map[string]interface{}{
			"type": "status_new",
			"payload": map[string]interface{}{
				"owner":  owner,
				"status": item,
			},
		}); marshalErr == nil {
			hd.broadcastStatusWS(mutualTelephons, msg)
		}

		ctx.JSON(http.StatusOK, gin.H{"status": item})
	}
}

// HandlerGetStatusFeed devuelve "mis estados" y los de mis contactos mutuos.
func (hd *HandlerStatus) HandlerGetStatusFeed() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exists := ctx.Get("telephon")
		if !exists {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "error al obtener los datos"})
			return
		}

		feed, err := hd.service.GetFeed(telephon.(string), ctx)
		if err != nil {
			respondInternal(ctx, err)
			return
		}
		ctx.JSON(http.StatusOK, feed)
	}
}

// HandlerMarkStatusViewed marca un estado como visto por el usuario autenticado.
// Si es la primera vez que lo ve, notifica al dueño por WS ("status_viewed").
// El ID del estado viene validado por MiddlewareStatusID.
func (hd *HandlerStatus) HandlerMarkStatusViewed() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exists := ctx.Get("telephon")
		statusID, exists2 := ctx.Get("statusID")
		if !exists || !exists2 {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "error al obtener los datos"})
			return
		}

		created, ownerTelephon, viewer, viewCount, err := hd.service.MarkStatusViewed(telephon.(string), statusID.(uint), ctx)
		if err != nil {
			respondStatusError(ctx, "MarkStatusViewed", err)
			return
		}

		if created && ownerTelephon != "" {
			if msg, marshalErr := json.Marshal(map[string]interface{}{
				"type": "status_viewed",
				"payload": map[string]interface{}{
					"statusId":  statusID.(uint),
					"viewer":    viewer,
					"viewedAt":  viewer.ViewedAt,
					"viewCount": viewCount,
				},
			}); marshalErr == nil {
				hd.broadcastStatusWS([]string{ownerTelephon}, msg)
			}
		}

		ctx.JSON(http.StatusOK, gin.H{"message": "Estado marcado como visto"})
	}
}

// HandlerGetStatusViewers lista quién vio un estado propio (solo el dueño puede consultarlo).
// El ID del estado viene validado por MiddlewareStatusID.
func (hd *HandlerStatus) HandlerGetStatusViewers() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exists := ctx.Get("telephon")
		statusID, exists2 := ctx.Get("statusID")
		if !exists || !exists2 {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "error al obtener los datos"})
			return
		}

		viewers, err := hd.service.GetStatusViewers(telephon.(string), statusID.(uint), ctx)
		if err != nil {
			respondStatusError(ctx, "GetStatusViewers", err)
			return
		}
		ctx.JSON(http.StatusOK, gin.H{"viewers": viewers})
	}
}

// HandlerDeleteStatus borra un estado propio y notifica a los contactos mutuos
// por WS ("status_deleted"). El ID del estado viene validado por MiddlewareStatusID.
func (hd *HandlerStatus) HandlerDeleteStatus() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exists := ctx.Get("telephon")
		statusID, exists2 := ctx.Get("statusID")
		if !exists || !exists2 {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "error al obtener los datos"})
			return
		}

		mutualTelephons, err := hd.service.DeleteStatus(telephon.(string), statusID.(uint), ctx)
		if err != nil {
			respondStatusError(ctx, "DeleteStatus", err)
			return
		}

		if msg, marshalErr := json.Marshal(map[string]interface{}{
			"type": "status_deleted",
			"payload": map[string]interface{}{
				"ownerTelephon": telephon.(string),
				"statusId":      statusID.(uint),
			},
		}); marshalErr == nil {
			hd.broadcastStatusWS(mutualTelephons, msg)
		}

		ctx.JSON(http.StatusOK, gin.H{"message": "Estado eliminado"})
	}
}
