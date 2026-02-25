package websocket

import (
	"encoding/json"
	"gorm/backend/models"
	"gorm/backend/services"
	"log"
	"time"

	"github.com/gorilla/websocket"
)

const (
	// Tiempo máximo para escribir un mensaje al cliente
	writeWait = 10 * time.Second

	// Tiempo máximo para leer el siguiente mensaje del cliente
	pongWait = 60 * time.Second

	// Intervalo de envío de pings al cliente (debe ser menor que pongWait)
	pingPeriod = (pongWait * 9) / 10

	// Tamaño máximo del mensaje (512 KB)
	maxMessageSize = 512 * 1024
)

type Client struct {
	Username       string // Para mostrar en la UI
	Telephon       string // Identificador único (inmutable)
	Conn           *websocket.Conn
	Send           chan []byte
	ServiceChat    *services.ServiceChat
	ServiceContact *services.ServiceApiContact
	ServiceCall    *services.ServiceCall
}

// messageRouter es un mapa de tipo de mensaje → función handler.
// Se inicializa una vez por cliente al crear el readPump.
func (c *Client) buildRouter() map[string]func(*MessageHandler) {
	return map[string]func(*MessageHandler){
		"chat":           (*MessageHandler).HandleChatMessage,
		"read":           (*MessageHandler).HandleReadMessage,
		"typing":         (*MessageHandler).HandleTypingIndicator,
		"edit_message":   (*MessageHandler).HandleEditMessage,
		"delete_message": (*MessageHandler).HandleDeleteMessage,
		"call_offer":     (*MessageHandler).HandleCallOffer,
		"call_accept":    (*MessageHandler).HandleCallAccept,
		"call_reject":    (*MessageHandler).HandleCallReject,
		"call_end":       (*MessageHandler).HandleCallEnd,
	}
}

// readPump lee mensajes entrantes del WebSocket, los enruta al handler
// correspondiente y cierra la conexión al terminar.
func (c *Client) readPump(hub *Hub) {
	defer func() {
		hub.Remove <- c
		c.Conn.Close()
	}()

	// Configurar límites de lectura
	c.Conn.SetReadLimit(maxMessageSize)
	c.Conn.SetReadDeadline(time.Now().Add(pongWait))
	c.Conn.SetPongHandler(func(string) error {
		c.Conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	router := c.buildRouter()

	for {
		// 1. Leer mensaje crudo
		_, messageBytes, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("Error de conexión WebSocket: %v", err)
			}
			break
		}

		// 2. Decodificar encabezado (Type)
		var baseMsg models.BaseMessage
		if err := json.Unmarshal(messageBytes, &baseMsg); err != nil {
			log.Println("Error formato JSON:", err)
			continue
		}

		// 3. Ping tiene respuesta directa, no necesita handler
		if baseMsg.Type == "ping" {
			c.Send <- []byte(`{"type":"pong"}`)
			continue
		}

		// 4. Buscar handler en el mapa y ejecutar
		if handlerFunc, exists := router[baseMsg.Type]; exists {
			handler := NewMessageHandler(c, hub, baseMsg.Payload)
			handlerFunc(handler)
		} else {
			log.Printf("Tipo de mensaje desconocido: %s", baseMsg.Type)
		}
	}
}

// writePump envía mensajes al cliente WebSocket y mantiene viva la conexión
// mediante pings periódicos.
func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()

	for {
		select {
		case msg, ok := <-c.Send:
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// El canal Send fue cerrado
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			if err := c.Conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}

		case <-ticker.C:
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
