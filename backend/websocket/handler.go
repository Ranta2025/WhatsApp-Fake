package websocket

import (
	"encoding/json"
	"gorm/backend/config"
	"gorm/backend/services"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		log.Printf("[WS] CheckOrigin called. Origin: %s", origin)
		if origin == "" {
			log.Println("[WS] Origin empty, allowing direct connection")
			return true // Conexiones directas sin Origin (ej: clientes nativos)
		}
		allowed := config.IsAllowedOrigin(origin)
		log.Printf("[WS] Origin allowed: %v", allowed)
		return allowed
	},
}

func HandleWebSocket(hub *Hub, chatService *services.ServiceChat, contactService *services.ServiceApiContact) gin.HandlerFunc {
	return func(c *gin.Context) {
		username, exist := c.Get("username")
		telephon, exist2 := c.Get("telephon")
		if !exist || !exist2 {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Usuario no autenticado"})
			return
		}

		conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			log.Printf("[WS] Upgrade failed: %v", err)
			return
		}

		client := &Client{
			Username:       username.(string),
			Telephon:       telephon.(string),
			Conn:           conn,
			Send:           make(chan []byte, 256),
			ServiceChat:    chatService,
			ServiceContact: contactService,
		}
		hub.Register <- client

		// Enviar lista inicial de contactos online después de un pequeño delay
		// para asegurar que los listeners del cliente estén registrados
		go func() {
			time.Sleep(100 * time.Millisecond)
			onlineContacts := hub.GetOnlineContacts(telephon.(string))
			initialMsg, _ := json.Marshal(map[string]interface{}{
				"type": "contacts_online",
				"payload": map[string]interface{}{
					"contacts": onlineContacts,
				},
			})
			client.Send <- initialMsg
		}()

		go client.writePump()
		client.readPump(hub)
	}
}
