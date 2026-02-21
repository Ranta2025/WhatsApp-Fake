package websocket

import (
	"context"
	"encoding/json"
	"gorm/backend/models"
	"log"
)

// MessageHandler maneja los diferentes tipos de mensajes WebSocket
type MessageHandler struct {
	Client  *Client
	Hub     *Hub
	Payload json.RawMessage
}

// NewMessageHandler crea un nuevo manejador de mensajes
func NewMessageHandler(client *Client, hub *Hub, payload json.RawMessage) *MessageHandler {
	return &MessageHandler{
		Client:  client,
		Hub:     hub,
		Payload: payload,
	}
}

// HandleChatMessage maneja el envío de mensajes de chat
func (mh *MessageHandler) HandleChatMessage() {
	// 1. Deserializar el payload como MessageGet
	var msgGet models.MessageGet
	if err := json.Unmarshal(mh.Payload, &msgGet); err != nil {
		log.Println("Error al deserializar mensaje de chat:", err)
		return
	}

	// 2. Verificar si el receptor está conectado (usando telephon)
	_, receptorConnected := mh.Hub.GetClient(msgGet.Receptor)

	// 3. Determinar el estado del mensaje
	status := "enviado"
	if receptorConnected {
		status = "entregado"
	}

	// 4. Crear el mensaje con el servicio (usando telephon del remitente)
	messageCreat := models.MessageCreat{
		MessageGet: msgGet,
		Telephon:   mh.Client.Telephon,
	}

	ctx := context.Background()
	messageSaved, err := mh.Client.ServiceChat.ServiceCreatMessageWithStatus(messageCreat, status, ctx)
	if err != nil {
		log.Println("Error al guardar mensaje:", err)
		// Enviar error al cliente
		errorMsg, _ := json.Marshal(map[string]interface{}{
			"type":  "error",
			"error": "Error al enviar mensaje",
		})
		mh.Client.Send <- errorMsg
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
	mh.Client.Send <- responseBytes

	// 7. Enviar al receptor si está conectado (usando telephon)
	if receptorConnected {
		mh.Hub.SendTo(msgGet.Receptor, responseBytes)
	}
}

// HandleReadMessage maneja la marcación de mensajes como leídos
func (mh *MessageHandler) HandleReadMessage() {
	// 1. Deserializar el payload
	var msgRead models.MessageRead
	if err := json.Unmarshal(mh.Payload, &msgRead); err != nil {
		log.Println("Error al deserializar mensaje read:", err)
		return
	}

	// 2. Actualizar mensajes a "visto" en la base de datos (usando telephons)
	ctx := context.Background()
	err := mh.Client.ServiceChat.ServicePutMessageStatusDelivered(msgRead.From, mh.Client.Telephon, ctx)
	if err != nil {
		log.Println("Error al actualizar mensajes a visto:", err)
		return
	}

	// 3. Notificar al remitente que sus mensajes fueron vistos (usando telephon)
	_, senderConnected := mh.Hub.GetClient(msgRead.From)

	if senderConnected {
		notification := map[string]interface{}{
			"type": "read",
			"payload": map[string]interface{}{
				"from": mh.Client.Telephon,
			},
		}
		notificationBytes, _ := json.Marshal(notification)
		mh.Hub.SendTo(msgRead.From, notificationBytes)
	}

	log.Printf("Usuario %s (tel: %s) marcó mensajes de %s como vistos", mh.Client.Username, mh.Client.Telephon, msgRead.From)
}

// HandleTypingIndicator maneja los indicadores de escritura
func (mh *MessageHandler) HandleTypingIndicator() {
	// 1. Deserializar el payload
	var typingData models.TypingIndicator
	if err := json.Unmarshal(mh.Payload, &typingData); err != nil {
		log.Println("Error al deserializar typing indicator:", err)
		return
	}

	// 2. Verificar si el receptor está conectado (usando telephon)
	_, recipientConnected := mh.Hub.GetClient(typingData.To)

	// 3. Enviar notificación de "typing" al receptor si está conectado
	if recipientConnected {
		notification := map[string]interface{}{
			"type": "typing",
			"payload": map[string]interface{}{
				"from": mh.Client.Telephon, // Enviamos el telephon
			},
		}
		notificationBytes, _ := json.Marshal(notification)
		mh.Hub.SendTo(typingData.To, notificationBytes)
	}
}
