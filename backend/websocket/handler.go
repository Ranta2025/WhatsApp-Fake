package websocket

import (
	"context"
	"encoding/json"
	"gorm/backend/config"
	"gorm/backend/services"
	"log/slog"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		slog.Debug("[WS] CheckOrigin", "origin", origin)
		if origin == "" {
			slog.Debug("[WS] Origin empty, allowing direct connection")
			return true // Conexiones directas sin Origin (ej: clientes nativos)
		}
		allowed := config.IsAllowedOrigin(origin)
		slog.Debug("[WS] Origin allowed", "allowed", allowed)
		return allowed
	},
}

// HandleWebSocket actualiza la conexión HTTP a WebSocket, crea el Client y lo
// registra en el Hub. Envía la lista inicial de contactos online y lanza
// las goroutines de lectura y escritura.
func HandleWebSocket(hub *Hub, chatService services.ChatServicer, contactService services.ContactServicer, callService services.CallServicer, groupService services.GroupServicer) gin.HandlerFunc {
	return func(c *gin.Context) {
		username, exist := c.Get("username")
		telephon, exist2 := c.Get("telephon")
		if !exist || !exist2 {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Usuario no autenticado"})
			return
		}

		conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			slog.Warn("[WS] Upgrade failed", "error", err)
			return
		}

		client := &Client{
			Username:       username.(string),
			Telephon:       telephon.(string),
			Conn:           conn,
			Send:           make(chan []byte, 256),
			ServiceChat:    chatService,
			ServiceContact: contactService,
			ServiceCall:    callService,
			ServiceGroup:   groupService,
		}
		hub.Register <- client

		// Goroutine de inicialización: enviar estado inicial y unirse a rooms de grupos
		go func() {
			defer func() {
				if r := recover(); r != nil {
					slog.Error("[WS] panic en goroutine de inicializacion", "panic", r, "telephon", telephon.(string))
				}
			}()
			time.Sleep(100 * time.Millisecond)

			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()

			// 1. Enviar lista de contactos online
			onlineContacts := hub.GetOnlineContacts(telephon.(string))
			initialMsg, _ := json.Marshal(map[string]interface{}{
				"type": "contacts_online",
				"payload": map[string]interface{}{
					"contacts": onlineContacts,
				},
			})
			safeSend(client.Send, initialMsg)

			// 2. Marcar mensajes 1:1 pendientes como "entregado" y notificar remitentes
			senders, err := chatService.ServiceGetSendersAndMarkDelivered(telephon.(string), ctx)
			if err != nil {
				slog.Warn("[WS] Error marcando mensajes como entregados al conectar", "error", err, "telephon", telephon.(string))
			} else if len(senders) > 0 {
				deliveredMsg, _ := json.Marshal(map[string]interface{}{
					"type": "message_delivered",
					"payload": map[string]interface{}{
						"receiver": telephon.(string),
					},
				})
				for _, senderTel := range senders {
					hub.SendTo(senderTel, deliveredMsg)
				}
				slog.Info("[WS] Notificados remitentes de entrega", "count", len(senders), "telephon", telephon.(string))
			}

			// 3. Unirse a las rooms de todos los grupos del usuario
			if groupService != nil {
				groups, err := groupService.GetUserGroups(telephon.(string), ctx)
				if err == nil {
					for _, g := range groups {
						hub.JoinRoom(g.ID, client)
					}
					slog.Info("[WS] Unido a rooms de grupos", "count", len(groups), "telephon", telephon.(string))
				}
			}
		}()

		go client.writePump()
		client.readPump(hub)
	}
}
