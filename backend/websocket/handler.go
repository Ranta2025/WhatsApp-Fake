package websocket

import (
	"context"
	"encoding/json"
	"gorm/backend/config"
	"gorm/backend/logging"
	"gorm/backend/services"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		if origin == "" {
			return true // Conexiones directas sin Origin (ej: clientes nativos)
		}
		return config.IsAllowedOrigin(origin)
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
			logging.FromContext(c.Request.Context()).Warn("ws upgrade fallido", "err", err)
			return
		}

		client := NewClient(username.(string), telephon.(string), conn)
		client.ConnID = logging.RequestID(c.Request.Context())
		client.ServiceChat = chatService
		client.ServiceContact = contactService
		client.ServiceCall = callService
		client.ServiceGroup = groupService
		// Registro síncrono: al volver, el cliente ya es la conexión activa del
		// usuario, así initClient puede unirlo a sus rooms sin carreras.
		hub.RegisterClient(client)

		go client.writePump()
		go initClient(hub, client, chatService, groupService)
		client.readPump(hub)
	}
}

// initClient envía el estado inicial al cliente recién conectado: contactos
// online, notificaciones de entrega pendientes y alta en las rooms de sus grupos.
func initClient(hub *Hub, client *Client, chatService services.ChatServicer, groupService services.GroupServicer) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	telephon := client.Telephon

	// 1. Enviar lista de contactos online
	onlineContacts := hub.GetOnlineContacts(telephon)
	initialMsg, _ := json.Marshal(map[string]interface{}{
		"type": "contacts_online",
		"payload": map[string]interface{}{
			"contacts": onlineContacts,
		},
	})
	hub.SendToClient(client, initialMsg)

	// 2. Marcar mensajes 1:1 pendientes como "entregado" y notificar remitentes
	senders, err := chatService.ServiceGetSendersAndMarkDelivered(telephon, ctx)
	if err != nil {
		client.log().Error("ws error marcando mensajes como entregados al conectar", "err", err)
	} else if len(senders) > 0 {
		deliveredMsg, _ := json.Marshal(map[string]interface{}{
			"type": "message_delivered",
			"payload": map[string]interface{}{
				"receiver": telephon,
			},
		})
		hub.sendToMany(senders, deliveredMsg)
	}

	// 3. Unirse a las rooms de todos los grupos del usuario
	if groupService != nil {
		groups, err := groupService.GetUserGroups(telephon, ctx)
		if err != nil {
			client.log().Error("ws error obteniendo grupos del usuario", "err", err)
			return
		}
		for _, g := range groups {
			hub.JoinRoom(g.ID, client)
			// 4. Al conectar se da por entregado todo lo pendiente del grupo
			// (equivalente al bulk de los chats 1:1) y se avisa a los demás.
			update, err := groupService.AdvanceGroupDelivered(telephon, g.ID, allGroupMessages, ctx)
			if err != nil {
				client.log().Error("ws error marcando grupo como entregado", "group_id", g.ID, "err", err)
				continue
			}
			if update != nil {
				publishGroupReceipt(hub, update)
			}
		}
	}
}
