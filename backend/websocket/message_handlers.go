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

// HandleEditMessage maneja la edición de un mensaje existente
func (mh *MessageHandler) HandleEditMessage() {
	// 1. Deserializar el payload como MessageEdit
	var msgEdit models.MessageEdit
	if err := json.Unmarshal(mh.Payload, &msgEdit); err != nil {
		log.Println("Error al deserializar mensaje de edición:", err)
		return
	}

	// 2. Validar que el contenido no esté vacío
	if msgEdit.Message == "" {
		errorMsg, _ := json.Marshal(map[string]interface{}{
			"type":  "error",
			"error": "El mensaje editado no puede estar vacío",
		})
		mh.Client.Send <- errorMsg
		return
	}

	// 3. Editar el mensaje usando el servicio
	ctx := context.Background()
	updatedMsg, err := mh.Client.ServiceChat.ServiceEditMessage(mh.Client.Telephon, msgEdit.MessageID, msgEdit.Message, ctx)
	if err != nil {
		log.Println("Error al editar mensaje:", err)
		errorMsg, _ := json.Marshal(map[string]interface{}{
			"type":  "error",
			"error": "Error al editar mensaje: " + err.Error(),
		})
		mh.Client.Send <- errorMsg
		return
	}

	log.Printf("[WS] Mensaje editado, ID: %d", updatedMsg.MessageID)

	// 4. Preparar la respuesta
	responseMsg := map[string]interface{}{
		"type":    "edit_message",
		"payload": updatedMsg,
	}
	responseBytes, _ := json.Marshal(responseMsg)

	// 5. Enviar confirmación al remitente
	mh.Client.Send <- responseBytes

	// 6. Enviar al receptor si está conectado
	_, receptorConnected := mh.Hub.GetClient(msgEdit.Receptor)
	if receptorConnected {
		mh.Hub.SendTo(msgEdit.Receptor, responseBytes)
	}
}

func (mh *MessageHandler) HandleDeleteMessage() {
	var msgDel models.MessageDelete
	if err := json.Unmarshal(mh.Payload, &msgDel); err != nil {
		log.Println("Error al deserializar mensaje de eliminación:", err)
		return
	}
	ctx := context.Background()
	deletedMsg, err := mh.Client.ServiceChat.ServiceDeleteMessage(mh.Client.Telephon, msgDel.MessageID, ctx)
	if err != nil {
		log.Println("Error al eliminar mensaje:", err)
		errorMsg, _ := json.Marshal(map[string]interface{}{
			"type":  "error",
			"error": "Error al eliminar mensaje: " + err.Error(),
		})
		mh.Client.Send <- errorMsg
		return
	}
	responseMsg := map[string]interface{}{
		"type":    "delete_message",
		"payload": deletedMsg,
	}
	responseBytes, _ := json.Marshal(responseMsg)
	mh.Client.Send <- responseBytes
	_, receptorConnected := mh.Hub.GetClient(msgDel.Receptor)
	if receptorConnected {
		mh.Hub.SendTo(msgDel.Receptor, responseBytes)
	}
}
