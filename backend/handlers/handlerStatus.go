package handlers

import (
	"net/http"
	"strconv"

	"gorm/backend/models"
	"gorm/backend/services"
	"gorm/backend/websocket"

	"github.com/gin-gonic/gin"
)

type HandlerStatus struct {
	service services.StatusServicer
	hub     *websocket.Hub
}

func InitHandlerStatus(service services.StatusServicer, hub *websocket.Hub) *HandlerStatus {
	return &HandlerStatus{service: service, hub: hub}
}

func (hd *HandlerStatus) HandleGetFeed() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exist := ctx.Get("telephon")
		if !exist {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "error al obtener datos"})
			ctx.Abort()
			return
		}
		feed, err := hd.service.GetFeed(telephon.(string), ctx)
		if err != nil {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			ctx.Abort()
			return
		}
		ctx.JSON(http.StatusOK, feed)
	}
}

func (hd *HandlerStatus) HandleCreateStatus() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exist := ctx.Get("telephon")
		statusPayload, exist2 := ctx.Get("statusCreate")
		if !exist || !exist2 {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "error al obtener datos"})
			ctx.Abort()
			return
		}

		status, err := hd.service.CreateStatus(telephon.(string), statusPayload.(models.StatusCreate), ctx)
		if err != nil {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			ctx.Abort()
			return
		}

		if hd.hub != nil {
			audience, audienceErr := hd.service.GetAudienceTelephons(telephon.(string), ctx)
			if audienceErr == nil {
				hd.hub.NotifyStatusCreated(audience, telephon.(string), status.ID)
			}
		}

		ctx.JSON(http.StatusCreated, gin.H{"status": status})
	}
}

func (hd *HandlerStatus) HandleMarkViewed() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exist := ctx.Get("telephon")
		if !exist {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "error al obtener datos"})
			ctx.Abort()
			return
		}
		statusID, err := strconv.ParseUint(ctx.Param("statusID"), 10, 64)
		if err != nil || statusID == 0 {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "identificador de estado inválido"})
			ctx.Abort()
			return
		}
		viewedEvent, err := hd.service.MarkViewed(telephon.(string), uint(statusID), ctx)
		if err != nil {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			ctx.Abort()
			return
		}
		if hd.hub != nil && viewedEvent != nil && viewedEvent.OwnerTelephon != "" {
			hd.hub.NotifyStatusViewed(viewedEvent.OwnerTelephon, viewedEvent)
		}
		ctx.JSON(http.StatusOK, gin.H{"message": "estado marcado como visto"})
	}
}

func (hd *HandlerStatus) HandleDeleteStatus() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exist := ctx.Get("telephon")
		if !exist {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "error al obtener datos"})
			ctx.Abort()
			return
		}
		statusID, err := strconv.ParseUint(ctx.Param("statusID"), 10, 64)
		if err != nil || statusID == 0 {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "identificador de estado inválido"})
			ctx.Abort()
			return
		}
		if err := hd.service.DeleteStatus(telephon.(string), uint(statusID), ctx); err != nil {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			ctx.Abort()
			return
		}
		if hd.hub != nil {
			audience, audienceErr := hd.service.GetAudienceTelephons(telephon.(string), ctx)
			if audienceErr == nil {
				hd.hub.NotifyStatusDeleted(audience, telephon.(string), uint(statusID))
			}
		}
		ctx.JSON(http.StatusOK, gin.H{"message": "estado eliminado"})
	}
}
