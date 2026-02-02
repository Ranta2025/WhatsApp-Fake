package handlers

import (
	"gorm/backend/services"
	ws "gorm/backend/websocket"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		// En producción, validar el origen correctamente
		return true
	},
}

type HandlerWebSocket struct {
	service *services.ServiceWebSocket
}

func InitHandlerWebSocket(service *services.ServiceWebSocket) *HandlerWebSocket {
	return &HandlerWebSocket{
		service: service,
	}
}

// HandlerWSConnect maneja la conexión WebSocket
func (h *HandlerWebSocket) HandlerWSConnect() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		// Obtener username del contexto (puesto por middleware)
		username, exists := ctx.Get("username")
		if !exists {
			ctx.JSON(http.StatusUnauthorized, gin.H{
				"error": "No autenticado",
			})
			return
		}

		usernameStr, ok := username.(string)
		if !ok {
			ctx.JSON(http.StatusInternalServerError, gin.H{
				"error": "Error interno",
			})
			return
		}

		// Upgrade HTTP a WebSocket
		conn, err := upgrader.Upgrade(ctx.Writer, ctx.Request, nil)
		if err != nil {
			log.Printf("Error en upgrade WebSocket: %v", err)
			return
		}

		// Crear cliente WebSocket
		client := &ws.Client{
			Hub:      h.service.Hub,
			Conn:     conn,
			Send:     make(chan []byte, 256),
			Username: usernameStr,
		}

		// Registrar cliente en el hub
		client.Hub.Register <- client

		// Iniciar goroutines para lectura y escritura
		go client.WritePump()
		go client.ReadPump()
	}
}
