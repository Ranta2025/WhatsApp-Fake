package websocket

import (
	"encoding/json"
	"gorm/backend/services"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func HandleWebSocket(hub *Hub, chatService *services.ServiceChat) gin.HandlerFunc {
	return func(c *gin.Context) {
		username, exist := c.Get("username")
		if !exist {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Usuario no autenticado"})
			return
		}

		conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			return
		}

		client := &Client{
			Username:    username.(string),
			Conn:        conn,
			Send:        make(chan []byte, 256),
			ServiceChat: chatService,
		}
		hub.Register <- client

		// Enviar lista inicial de contactos online
		onlineContacts := hub.GetOnlineContacts(username.(string))
		initialMsg, _ := json.Marshal(map[string]interface{}{
			"type": "contacts_online",
			"payload": map[string]interface{}{
				"contacts": onlineContacts,
			},
		})
		client.Send <- initialMsg

		go client.writePump()
		client.readPump(hub)
	}
}
