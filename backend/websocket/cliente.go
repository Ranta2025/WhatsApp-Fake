package websocket

import (
	"encoding/json"
	"gorm/backend/models"
	"gorm/backend/services"
	"log"
	"sync/atomic"
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
	Telephon       string // Identificador único (inmutable)
	Conn           *websocket.Conn
	Send           chan []byte
	ServiceChat    services.ChatServicer
	ServiceContact services.ContactServicer
	ServiceCall    services.CallServicer
	ServiceGroup   services.GroupServicer

	// username puede cambiar mientras la conexión está abierta (cambio de
	// nombre de usuario), por eso se accede de forma atómica.
	username atomic.Value

	// closed indica que Send fue cerrado. Protegido por Hub.mu.
	closed bool
}

// NewClient crea un cliente WebSocket para el usuario indicado.
func NewClient(username, telephon string, conn *websocket.Conn) *Client {
	c := &Client{
		Telephon: telephon,
		Conn:     conn,
		Send:     make(chan []byte, 256),
	}
	c.username.Store(username)
	return c
}

// Username devuelve el nombre de usuario actual (para mostrar en la UI).
func (c *Client) Username() string {
	name, _ := c.username.Load().(string)
	return name
}

// SetUsername actualiza el nombre de usuario mostrado.
func (c *Client) SetUsername(name string) {
	c.username.Store(name)
}

// messageRouter es un mapa de tipo de mensaje → función handler.
// Se inicializa una vez por cliente al crear el readPump.
func (c *Client) buildRouter() map[string]func(*MessageHandler) {
	return map[string]func(*MessageHandler){
		// Chat 1:1
		"chat":           (*MessageHandler).HandleChatMessage,
		"read":           (*MessageHandler).HandleReadMessage,
		"typing":         (*MessageHandler).HandleTypingIndicator,
		"edit_message":   (*MessageHandler).HandleEditMessage,
		"delete_message": (*MessageHandler).HandleDeleteMessage,
		// Llamadas
		"call_offer":  (*MessageHandler).HandleCallOffer,
		"call_accept": (*MessageHandler).HandleCallAccept,
		"call_reject": (*MessageHandler).HandleCallReject,
		"call_end":    (*MessageHandler).HandleCallEnd,
		// Grupos
		"group_chat":           (*MessageHandler).HandleGroupChatMessage,
		"group_typing":         (*MessageHandler).HandleGroupTyping,
		"group_edit_message":   (*MessageHandler).HandleGroupEditMessage,
		"group_delete_message": (*MessageHandler).HandleGroupDeleteMessage,
		"group_join":           (*MessageHandler).HandleGroupJoin,
		"group_delivered":      (*MessageHandler).HandleGroupDelivered,
		"group_read":           (*MessageHandler).HandleGroupRead,
	}
}

// readPump lee mensajes entrantes del WebSocket, los enruta al handler
// correspondiente y cierra la conexión al terminar.
func (c *Client) readPump(hub *Hub) {
	defer func() {
		hub.UnregisterClient(c)
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
				log.Printf("[WS] Error de conexión (tel: %s): %v", c.Telephon, err)
			}
			break
		}

		// 2. Decodificar encabezado (Type)
		var baseMsg models.BaseMessage
		if err := json.Unmarshal(messageBytes, &baseMsg); err != nil {
			log.Println("[WS] Error formato JSON:", err)
			continue
		}

		// 3. Ping tiene respuesta directa, no necesita handler
		if baseMsg.Type == "ping" {
			hub.SendToClient(c, []byte(`{"type":"pong"}`))
			continue
		}

		// 4. Buscar handler en el mapa y ejecutar
		if handlerFunc, exists := router[baseMsg.Type]; exists {
			handler := NewMessageHandler(c, hub, baseMsg.Payload)
			handlerFunc(handler)
		} else {
			log.Printf("[WS] Tipo de mensaje desconocido: %q", baseMsg.Type)
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
