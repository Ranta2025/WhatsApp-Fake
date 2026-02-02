package websocket

import (
	"encoding/json"
	"log"
	"time"

	"github.com/gorilla/websocket"
)

const (
	// Tiempo máximo para escribir mensaje
	writeWait = 10 * time.Second

	// Tiempo máximo para leer próximo pong del cliente (reducido a 45s)
	pongWait = 45 * time.Second

	// Enviar pings al cliente con este período (debe ser menor que pongWait)
	pingPeriod = (pongWait * 9) / 10 // ~40 segundos

	// Tamaño máximo del mensaje
	maxMessageSize = 512
)

// Client representa un cliente WebSocket conectado
type Client struct {
	Hub      *Hub
	Conn     *websocket.Conn
	Send     chan []byte
	Username string
}

// ReadPump lee mensajes del WebSocket y los envía al hub
func (c *Client) ReadPump() {
	defer func() {
		c.Hub.Unregister <- c
		c.Conn.Close()
	}()

	c.Conn.SetReadDeadline(time.Now().Add(pongWait))
	c.Conn.SetReadLimit(maxMessageSize)
	c.Conn.SetPongHandler(func(string) error {
		c.Conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("error: %v", err)
			}
			break
		}

		// Resetear deadline al recibir cualquier mensaje (incluido heartbeat del cliente)
		c.Conn.SetReadDeadline(time.Now().Add(pongWait))

		// Enviar mensaje al hub para procesamiento
		c.Hub.Broadcast <- &BroadcastMessage{
			Message: message,
			Client:  c,
		}
	}
}

// WritePump escribe mensajes del hub al WebSocket
func (c *Client) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// El hub cerró el canal
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.Conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)

			// Agregar mensajes pendientes en cola al mensaje actual
			n := len(c.Send)
			for i := 0; i < n; i++ {
				w.Write([]byte{'\n'})
				w.Write(<-c.Send)
			}

			if err := w.Close(); err != nil {
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

// SendJSON envía un mensaje JSON al cliente
func (c *Client) SendJSON(v interface{}) error {
	data, err := json.Marshal(v)
	if err != nil {
		return err
	}

	select {
	case c.Send <- data:
		return nil
	default:
		return nil
	}
}
