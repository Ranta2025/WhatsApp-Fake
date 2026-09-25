package websocket

import (
	"context"
	"encoding/json"
	"gorm/backend/models"
	"log"
	"time"
)

// handlerTimeout limita la duración de las operaciones de BD de cada mensaje WS.
const handlerTimeout = 15 * time.Second

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

// context devuelve un contexto con timeout para las operaciones del handler.
func (mh *MessageHandler) context() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), handlerTimeout)
}

// reply envía un mensaje a la conexión que originó la petición (sin bloquear y
// sin riesgo de pánico si la conexión se cerró mientras tanto).
func (mh *MessageHandler) reply(msg []byte) {
	mh.Hub.SendToClient(mh.Client, msg)
}

// sendEvent serializa {type, payload} y lo envía al usuario indicado.
func (mh *MessageHandler) sendEvent(to string, eventType string, payload interface{}) {
	msg, err := json.Marshal(map[string]interface{}{
		"type":    eventType,
		"payload": payload,
	})
	if err != nil {
		log.Printf("[WS] Error serializando evento %s: %v", eventType, err)
		return
	}
	mh.Hub.SendTo(to, msg)
}

// HandleChatMessage maneja el envío de mensajes de chat
func (mh *MessageHandler) HandleChatMessage() {
	var msgGet models.MessageGet
	if err := json.Unmarshal(mh.Payload, &msgGet); err != nil {
		log.Println("[WS] Error al deserializar mensaje de chat:", err)
		return
	}

	// El estado inicial depende de si el receptor está conectado
	status := "enviado"
	if mh.Hub.IsOnline(msgGet.Receptor) {
		status = "entregado"
	}

	messageCreat := models.MessageCreat{
		MessageGet: msgGet,
		Telephon:   mh.Client.Telephon,
	}

	ctx, cancel := mh.context()
	defer cancel()
	messageSaved, err := mh.Client.ServiceChat.ServiceCreatMessageWithStatus(messageCreat, status, ctx)
	if err != nil {
		log.Println("[WS] Error al guardar mensaje:", err)
		mh.sendError("Error al enviar mensaje: " + err.Error())
		return
	}

	responseBytes, _ := json.Marshal(map[string]interface{}{
		"type":    "chat",
		"payload": messageSaved,
	})

	// Confirmación al remitente y entrega al receptor (si está conectado)
	mh.reply(responseBytes)
	if messageSaved.Receptor != mh.Client.Telephon {
		mh.Hub.SendTo(messageSaved.Receptor, responseBytes)
	}
}

// HandleReadMessage maneja la marcación de mensajes como leídos
func (mh *MessageHandler) HandleReadMessage() {
	var msgRead models.MessageRead
	if err := json.Unmarshal(mh.Payload, &msgRead); err != nil || msgRead.From == "" {
		log.Println("[WS] Error al deserializar mensaje read:", err)
		return
	}

	// Actualizar a "visto" los mensajes que msgRead.From envió a este usuario
	ctx, cancel := mh.context()
	defer cancel()
	if err := mh.Client.ServiceChat.ServicePutMessageStatusDelivered(msgRead.From, mh.Client.Telephon, ctx); err != nil {
		log.Println("[WS] Error al actualizar mensajes a visto:", err)
		return
	}

	// Notificar al remitente que sus mensajes fueron vistos
	mh.sendEvent(msgRead.From, "read", map[string]interface{}{
		"from": mh.Client.Telephon,
	})
}

// HandleTypingIndicator maneja los indicadores de escritura
func (mh *MessageHandler) HandleTypingIndicator() {
	var typingData models.TypingIndicator
	if err := json.Unmarshal(mh.Payload, &typingData); err != nil || typingData.To == "" {
		return
	}
	mh.sendEvent(typingData.To, "typing", map[string]interface{}{
		"from": mh.Client.Telephon,
	})
}

// HandleEditMessage maneja la edición de un mensaje existente
func (mh *MessageHandler) HandleEditMessage() {
	var msgEdit models.MessageEdit
	if err := json.Unmarshal(mh.Payload, &msgEdit); err != nil {
		log.Println("[WS] Error al deserializar mensaje de edición:", err)
		return
	}

	ctx, cancel := mh.context()
	defer cancel()
	updatedMsg, err := mh.Client.ServiceChat.ServiceEditMessage(mh.Client.Telephon, msgEdit.MessageID, msgEdit.Message, ctx)
	if err != nil {
		log.Println("[WS] Error al editar mensaje:", err)
		mh.sendError("Error al editar mensaje: " + err.Error())
		return
	}

	responseBytes, _ := json.Marshal(map[string]interface{}{
		"type":    "edit_message",
		"payload": updatedMsg,
	})

	// Se notifica al receptor REAL del mensaje (de la BD), no al que indique el
	// cliente: si no, se podría enviar el evento a cualquier usuario.
	mh.reply(responseBytes)
	if updatedMsg.Receptor != mh.Client.Telephon {
		mh.Hub.SendTo(updatedMsg.Receptor, responseBytes)
	}
}

// HandleDeleteMessage elimina un mensaje para todos (solo el remitente puede hacerlo).
func (mh *MessageHandler) HandleDeleteMessage() {
	var msgDel models.MessageDelete
	if err := json.Unmarshal(mh.Payload, &msgDel); err != nil {
		log.Println("[WS] Error al deserializar mensaje de eliminación:", err)
		return
	}

	ctx, cancel := mh.context()
	defer cancel()
	deletedMsg, err := mh.Client.ServiceChat.ServiceDeleteMessage(mh.Client.Telephon, msgDel.MessageID, ctx)
	if err != nil {
		log.Println("[WS] Error al eliminar mensaje:", err)
		mh.sendError("Error al eliminar mensaje: " + err.Error())
		return
	}

	responseBytes, _ := json.Marshal(map[string]interface{}{
		"type":    "delete_message",
		"payload": deletedMsg,
	})
	mh.reply(responseBytes)
	if deletedMsg.Receptor != mh.Client.Telephon {
		mh.Hub.SendTo(deletedMsg.Receptor, responseBytes)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Llamadas
// ─────────────────────────────────────────────────────────────────────────────

// HandleCallOffer maneja cuando un usuario quiere llamar a otro
func (mh *MessageHandler) HandleCallOffer() {
	var callOffer models.CallOffer
	if err := json.Unmarshal(mh.Payload, &callOffer); err != nil || callOffer.To == "" || callOffer.RoomID == "" {
		log.Println("[WS] call_offer inválido:", err)
		return
	}

	// Registrar la llamada; si los datos no son válidos no se reenvía la oferta
	if mh.Client.ServiceCall != nil {
		ctx, cancel := mh.context()
		err := mh.Client.ServiceCall.CreateCallLog(mh.Client.Telephon, callOffer.To, callOffer.RoomID, callOffer.CallType, ctx)
		cancel()
		if err != nil {
			log.Printf("[WS] Error registrando llamada: %v", err)
			mh.sendError("No se pudo iniciar la llamada: " + err.Error())
			return
		}
	}

	incoming := map[string]interface{}{
		"from":     mh.Client.Telephon,
		"username": mh.Client.Username(),
		"roomID":   callOffer.RoomID,
		"callType": callOffer.CallType,
	}

	if mh.Hub.IsOnline(callOffer.To) {
		mh.sendEvent(callOffer.To, "incoming_call", incoming)
		return
	}

	// Receptor no conectado: esperar 2s y reintentar por si está reconectando
	go func(hub *Hub, caller *Client, offer models.CallOffer) {
		time.Sleep(2 * time.Second)
		if hub.IsOnline(offer.To) {
			(&MessageHandler{Client: caller, Hub: hub}).sendEvent(offer.To, "incoming_call", incoming)
			return
		}
		// Realmente no disponible
		if caller.ServiceCall != nil {
			ctx, cancel := context.WithTimeout(context.Background(), handlerTimeout)
			if err := caller.ServiceCall.MarkCallUnavailable(offer.RoomID, caller.Telephon, ctx); err != nil {
				log.Printf("[WS] Error marcando llamada como no disponible: %v", err)
			}
			cancel()
		}
		errorMsg, _ := json.Marshal(map[string]interface{}{
			"type": "call_unavailable",
			"payload": map[string]interface{}{
				"to":     offer.To,
				"reason": "Usuario no disponible",
			},
		})
		hub.SendTo(caller.Telephon, errorMsg)
	}(mh.Hub, mh.Client, callOffer)
}

// forwardCallEvent actualiza el registro de la llamada (solo si el usuario
// participa en ella) y reenvía el evento al otro participante.
func (mh *MessageHandler) forwardCallEvent(eventType string, update func(roomID, telephon string, ctx context.Context) error) {
	var callResp models.CallResponse
	if err := json.Unmarshal(mh.Payload, &callResp); err != nil || callResp.To == "" || callResp.RoomID == "" {
		log.Printf("[WS] %s inválido: %v", eventType, err)
		return
	}

	if update != nil {
		ctx, cancel := mh.context()
		err := update(callResp.RoomID, mh.Client.Telephon, ctx)
		cancel()
		if err != nil {
			// El usuario no participa en esa llamada (o no existe): no reenviar
			log.Printf("[WS] %s rechazado para %s (sala %s): %v", eventType, mh.Client.Telephon, callResp.RoomID, err)
			return
		}
	}

	mh.sendEvent(callResp.To, eventType, map[string]interface{}{
		"from":   mh.Client.Telephon,
		"roomID": callResp.RoomID,
	})
}

// HandleCallAccept maneja cuando el receptor acepta la llamada
func (mh *MessageHandler) HandleCallAccept() {
	if mh.Client.ServiceCall == nil {
		mh.forwardCallEvent("call_accepted", nil)
		return
	}
	mh.forwardCallEvent("call_accepted", mh.Client.ServiceCall.MarkCallAnswered)
}

// HandleCallReject maneja cuando el receptor rechaza la llamada
func (mh *MessageHandler) HandleCallReject() {
	if mh.Client.ServiceCall == nil {
		mh.forwardCallEvent("call_rejected", nil)
		return
	}
	mh.forwardCallEvent("call_rejected", mh.Client.ServiceCall.MarkCallRejected)
}

// HandleCallEnd maneja cuando alguien cuelga la llamada
func (mh *MessageHandler) HandleCallEnd() {
	if mh.Client.ServiceCall == nil {
		mh.forwardCallEvent("call_ended", nil)
		return
	}
	mh.forwardCallEvent("call_ended", mh.Client.ServiceCall.MarkCallEnded)
}

// ─────────────────────────────────────────────────────────────────────────────
// Handlers de mensajes grupales
// ─────────────────────────────────────────────────────────────────────────────

// HandleGroupChatMessage gestiona el envío de un mensaje a un grupo por WebSocket.
// Flujo: guardar en BD → confirmar al sender → broadcast a room (todos excepto sender).
func (mh *MessageHandler) HandleGroupChatMessage() {
	var msgSend models.GroupMessageSend
	if err := json.Unmarshal(mh.Payload, &msgSend); err != nil {
		log.Println("[WS-GROUP] Error al deserializar group_chat:", err)
		return
	}

	ctx, cancel := mh.context()
	defer cancel()
	savedMsg, err := mh.Client.ServiceGroup.SendGroupMessage(mh.Client.Telephon, msgSend, ctx)
	if err != nil {
		log.Printf("[WS-GROUP] Error al guardar mensaje de grupo: %v", err)
		mh.sendError("Error al enviar mensaje al grupo: " + err.Error())
		return
	}

	responseBytes, _ := json.Marshal(map[string]interface{}{
		"type":    "group_chat",
		"payload": savedMsg,
	})

	// Auto-unir al sender a la room (ya se verificó que es miembro al guardar)
	mh.Hub.JoinRoom(msgSend.GroupID, mh.Client)

	mh.reply(responseBytes)
	mh.Hub.SendToGroup(msgSend.GroupID, mh.Client.Telephon, responseBytes)
}

// HandleGroupTyping notifica a los miembros conectados del grupo que alguien está escribiendo.
// Solo se reenvía si el emisor está en la room del grupo (es miembro).
func (mh *MessageHandler) HandleGroupTyping() {
	var typing models.GroupTyping
	if err := json.Unmarshal(mh.Payload, &typing); err != nil || typing.GroupID == 0 {
		return
	}
	if !mh.Hub.IsInRoom(typing.GroupID, mh.Client.Telephon) {
		return
	}

	notification, _ := json.Marshal(map[string]interface{}{
		"type": "group_typing",
		"payload": map[string]interface{}{
			"groupID": typing.GroupID,
			"from":    mh.Client.Telephon,
		},
	})
	mh.Hub.SendToGroup(typing.GroupID, mh.Client.Telephon, notification)
}

// HandleGroupEditMessage gestiona la edición de un mensaje de grupo por WebSocket.
// Solo el autor puede editar; notifica a todos los miembros conectados.
func (mh *MessageHandler) HandleGroupEditMessage() {
	var payload struct {
		models.GroupMessageEdit
		GroupID uint `json:"groupID"`
	}
	if err := json.Unmarshal(mh.Payload, &payload); err != nil {
		log.Println("[WS-GROUP] Error al deserializar group_edit_message:", err)
		return
	}
	if payload.MessageID == 0 || payload.GroupID == 0 {
		mh.sendError("Los IDs de mensaje y grupo son obligatorios")
		return
	}

	ctx, cancel := mh.context()
	defer cancel()
	updatedMsg, err := mh.Client.ServiceGroup.EditGroupMessage(mh.Client.Telephon, payload.GroupID, payload.GroupMessageEdit, ctx)
	if err != nil {
		log.Printf("[WS-GROUP] Error al editar mensaje de grupo: %v", err)
		mh.sendError("Error al editar mensaje: " + err.Error())
		return
	}

	responseBytes, _ := json.Marshal(map[string]interface{}{
		"type":    "group_edit_message",
		"payload": updatedMsg,
	})
	mh.reply(responseBytes)
	mh.Hub.SendToGroup(payload.GroupID, mh.Client.Telephon, responseBytes)
}

// HandleGroupDeleteMessage gestiona la eliminación de un mensaje de grupo por WebSocket.
// Solo el autor puede eliminar; notifica a todos los miembros conectados.
func (mh *MessageHandler) HandleGroupDeleteMessage() {
	var payload struct {
		models.GroupMessageDelete
		GroupID uint `json:"groupID"`
	}
	if err := json.Unmarshal(mh.Payload, &payload); err != nil {
		log.Println("[WS-GROUP] Error al deserializar group_delete_message:", err)
		return
	}
	if payload.MessageID == 0 || payload.GroupID == 0 {
		mh.sendError("Los IDs de mensaje y grupo son obligatorios")
		return
	}

	ctx, cancel := mh.context()
	defer cancel()
	if err := mh.Client.ServiceGroup.DeleteGroupMessage(mh.Client.Telephon, payload.GroupID, payload.GroupMessageDelete, ctx); err != nil {
		log.Printf("[WS-GROUP] Error al eliminar mensaje de grupo: %v", err)
		mh.sendError("Error al eliminar mensaje: " + err.Error())
		return
	}

	responseBytes, _ := json.Marshal(map[string]interface{}{
		"type": "group_delete_message",
		"payload": map[string]interface{}{
			"MessageID": payload.MessageID,
			"GroupID":   payload.GroupID,
		},
	})
	mh.reply(responseBytes)
	mh.Hub.SendToGroup(payload.GroupID, mh.Client.Telephon, responseBytes)
}

// HandleGroupJoin añade al cliente a la room WS del grupo si es miembro.
// El frontend lo llama cada vez que el usuario abre un chat de grupo.
func (mh *MessageHandler) HandleGroupJoin() {
	var payload struct {
		GroupID uint `json:"groupID"`
	}
	if err := json.Unmarshal(mh.Payload, &payload); err != nil || payload.GroupID == 0 {
		return
	}

	ctx, cancel := mh.context()
	defer cancel()
	telephons, err := mh.Client.ServiceGroup.GetMemberTelephons(payload.GroupID, ctx)
	if err != nil {
		return
	}
	for _, t := range telephons {
		if t == mh.Client.Telephon {
			mh.Hub.JoinRoom(payload.GroupID, mh.Client)
			return
		}
	}
	log.Printf("[WS-GROUP] %s no es miembro del grupo %d — join denegado", mh.Client.Telephon, payload.GroupID)
}

// sendError es un helper para enviar mensajes de error al cliente WebSocket.
func (mh *MessageHandler) sendError(msg string) {
	errorMsg, _ := json.Marshal(map[string]interface{}{
		"type":  "error",
		"error": msg,
	})
	mh.reply(errorMsg)
}
