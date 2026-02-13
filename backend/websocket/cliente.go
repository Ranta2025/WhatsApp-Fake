package websocket

import (
	"context"
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
	Username    string
	Conn        *websocket.Conn
	Send        chan []byte
	ServiceChat *services.ServiceChat
}

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

		// 3. Router: Decidir qué servicio ejecuta la acción
		switch baseMsg.Type {
		case "ping":
			c.Send <- []byte(`{"type":"pong"}`)

		case "chat":
			c.handleChatMessage(hub, baseMsg.Payload)

		case "read":
			c.handleReadMessage(hub, baseMsg.Payload)

		case "typing":
			c.handleTypingIndicator(hub, baseMsg.Payload)

		default:
			log.Printf("Tipo de mensaje desconocido: %s", baseMsg.Type)
		}
	}
}

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

func (c *Client) handleChatMessage(hub *Hub, payload json.RawMessage) {
	// 1. Deserializar el payload como MessageGet
	var msgGet models.MessageGet
	if err := json.Unmarshal(payload, &msgGet); err != nil {
		log.Println("Error al deserializar mensaje de chat:", err)
		return
	}

	// 2. Verificar si el receptor está conectado
	hub.mu.RLock()
	_, receptorConnected := hub.Clients[msgGet.Receptor]
	hub.mu.RUnlock()

	// 3. Determinar el estado del mensaje
	status := "enviado"
	if receptorConnected {
		status = "entregado"
	}

	// 4. Crear el mensaje con el servicio
	messageCreat := models.MessageCreat{
		MessageGet: msgGet,
		Username:   c.Username,
	}

	ctx := context.Background()
	messageSaved, err := c.ServiceChat.ServiceCreatMessageWithStatus(messageCreat, status, ctx)
	if err != nil {
		log.Println("Error al guardar mensaje:", err)
		// Enviar error al cliente
		errorMsg, _ := json.Marshal(map[string]interface{}{
			"type":  "error",
			"error": "Error al enviar mensaje",
		})
		c.Send <- errorMsg
		return
	}

	log.Printf("[WS] Mensaje guardado, ID del servicio: %d", messageSaved.MessageID)
	log.Printf("[WS] messageSaved completo: %+v", messageSaved)

	// 5. Preparar el mensaje para enviar por WebSocket
	responseMsg := map[string]interface{}{
		"type":    "chat",
		"payload": messageSaved,
	}
	responseBytes, _ := json.Marshal(responseMsg)

	log.Printf("[WS] JSON a enviar: %s", string(responseBytes))

	// 6. Enviar al remitente (confirmación)
	c.Send <- responseBytes

	// 7. Enviar al receptor si está conectado
	if receptorConnected {
		hub.SendTo(msgGet.Receptor, responseBytes)
	}
}

func (c *Client) handleReadMessage(hub *Hub, payload json.RawMessage) {
	// 1. Deserializar el payload
	var msgRead models.MessageRead
	if err := json.Unmarshal(payload, &msgRead); err != nil {
		log.Println("Error al deserializar mensaje read:", err)
		return
	}

	// 2. Actualizar mensajes a "visto" en la base de datos
	ctx := context.Background()
	err := c.ServiceChat.ServicePutMessageStatusDelivered(msgRead.From, c.Username, ctx)
	if err != nil {
		log.Println("Error al actualizar mensajes a visto:", err)
		return
	}

	// 3. Notificar al remitente que sus mensajes fueron vistos
	hub.mu.RLock()
	_, senderConnected := hub.Clients[msgRead.From]
	hub.mu.RUnlock()

	if senderConnected {
		notification := map[string]interface{}{
			"type": "read",
			"payload": map[string]interface{}{
				"from": c.Username,
			},
		}
		notificationBytes, _ := json.Marshal(notification)
		hub.SendTo(msgRead.From, notificationBytes)
	}

	log.Printf("Usuario %s marcó mensajes de %s como vistos", c.Username, msgRead.From)
}

func (c *Client) handleTypingIndicator(hub *Hub, payload json.RawMessage) {
	// 1. Deserializar el payload
	var typingData models.TypingIndicator
	if err := json.Unmarshal(payload, &typingData); err != nil {
		log.Println("Error al deserializar typing indicator:", err)
		return
	}

	// 2. Verificar si el receptor está conectado
	hub.mu.RLock()
	_, recipientConnected := hub.Clients[typingData.To]
	hub.mu.RUnlock()

	// 3. Enviar notificación de "typing" al receptor si está conectado
	if recipientConnected {
		notification := map[string]interface{}{
			"type": "typing",
			"payload": map[string]interface{}{
				"from": c.Username,
			},
		}
		notificationBytes, _ := json.Marshal(notification)
		hub.SendTo(typingData.To, notificationBytes)
	}
}
