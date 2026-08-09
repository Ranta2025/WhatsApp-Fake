package websocket

import (
	"context"
	"encoding/json"
	"gorm/backend/models"
	"log"
	"time"
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
		safeSend(mh.Client.Send, errorMsg)
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
	safeSend(mh.Client.Send, responseBytes)

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
		safeSend(mh.Client.Send, errorMsg)
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
		safeSend(mh.Client.Send, errorMsg)
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
	safeSend(mh.Client.Send, responseBytes)

	// 6. Enviar al receptor si está conectado
	_, receptorConnected := mh.Hub.GetClient(msgEdit.Receptor)
	if receptorConnected {
		mh.Hub.SendTo(msgEdit.Receptor, responseBytes)
	}
}

// HandleCallOffer maneja cuando un usuario quiere llamar a otro
func (mh *MessageHandler) HandleCallOffer() {
	var callOffer models.CallOffer
	if err := json.Unmarshal(mh.Payload, &callOffer); err != nil {
		log.Println("Error al deserializar call_offer:", err)
		return
	}

	// Registrar la llamada en la base de datos
	if mh.Client.ServiceCall != nil {
		ctx := context.Background()
		if err := mh.Client.ServiceCall.CreateCallLog(mh.Client.Telephon, callOffer.To, callOffer.RoomID, callOffer.CallType, ctx); err != nil {
			log.Printf("[WS] Error registrando llamada: %v", err)
		}
	}

	_, recipientConnected := mh.Hub.GetClient(callOffer.To)
	if recipientConnected {
		notification := map[string]interface{}{
			"type": "incoming_call",
			"payload": map[string]interface{}{
				"from":     mh.Client.Telephon,
				"username": mh.Client.Username,
				"roomID":   callOffer.RoomID,
				"callType": callOffer.CallType,
			},
		}
		notificationBytes, _ := json.Marshal(notification)
		mh.Hub.SendTo(callOffer.To, notificationBytes)
	} else {
		// Receptor no conectado: esperar 2s y reintentar por si está reconectando
		go func(hub *Hub, caller *Client, offer models.CallOffer) {
			time.Sleep(2 * time.Second)
			_, backOnline := hub.GetClient(offer.To)
			if backOnline {
				// Reconectó en esos 2s, mandar la llamada
				notification := map[string]interface{}{
					"type": "incoming_call",
					"payload": map[string]interface{}{
						"from":     caller.Telephon,
						"username": caller.Username,
						"roomID":   offer.RoomID,
						"callType": offer.CallType,
					},
				}
				notificationBytes, _ := json.Marshal(notification)
				hub.SendTo(offer.To, notificationBytes)
			} else {
				// Realmente no disponible
				if caller.ServiceCall != nil {
					ctx := context.Background()
					caller.ServiceCall.MarkCallUnavailable(offer.RoomID, ctx)
				}
				errorMsg, _ := json.Marshal(map[string]interface{}{
					"type": "call_unavailable",
					"payload": map[string]interface{}{
						"to":     offer.To,
						"reason": "Usuario no disponible",
					},
				})
				// SendTo es seguro: usa select+default internamente
				hub.SendTo(caller.Telephon, errorMsg)
			}
		}(mh.Hub, mh.Client, callOffer)
	}
	log.Printf("[WS] Llamada de %s a %s (sala: %s, tipo: %s)", mh.Client.Telephon, callOffer.To, callOffer.RoomID, callOffer.CallType)
}

// HandleCallAccept maneja cuando el receptor acepta la llamada
func (mh *MessageHandler) HandleCallAccept() {
	var callResp models.CallResponse
	if err := json.Unmarshal(mh.Payload, &callResp); err != nil {
		log.Println("Error al deserializar call_accept:", err)
		return
	}

	// Marcar la llamada como contestada
	if mh.Client.ServiceCall != nil {
		ctx := context.Background()
		if err := mh.Client.ServiceCall.MarkCallAnswered(callResp.RoomID, ctx); err != nil {
			log.Printf("[WS] Error marcando llamada como contestada: %v", err)
		}
	}

	_, callerConnected := mh.Hub.GetClient(callResp.To)
	if callerConnected {
		notification := map[string]interface{}{
			"type": "call_accepted",
			"payload": map[string]interface{}{
				"from":   mh.Client.Telephon,
				"roomID": callResp.RoomID,
			},
		}
		notificationBytes, _ := json.Marshal(notification)
		mh.Hub.SendTo(callResp.To, notificationBytes)
	}
	log.Printf("[WS] Llamada aceptada por %s para %s", mh.Client.Telephon, callResp.To)
}

// HandleCallReject maneja cuando el receptor rechaza la llamada
func (mh *MessageHandler) HandleCallReject() {
	var callResp models.CallResponse
	if err := json.Unmarshal(mh.Payload, &callResp); err != nil {
		log.Println("Error al deserializar call_reject:", err)
		return
	}

	// Marcar la llamada como rechazada
	if mh.Client.ServiceCall != nil {
		ctx := context.Background()
		if err := mh.Client.ServiceCall.MarkCallRejected(callResp.RoomID, ctx); err != nil {
			log.Printf("[WS] Error marcando llamada como rechazada: %v", err)
		}
	}

	_, callerConnected := mh.Hub.GetClient(callResp.To)
	if callerConnected {
		notification := map[string]interface{}{
			"type": "call_rejected",
			"payload": map[string]interface{}{
				"from":   mh.Client.Telephon,
				"roomID": callResp.RoomID,
			},
		}
		notificationBytes, _ := json.Marshal(notification)
		mh.Hub.SendTo(callResp.To, notificationBytes)
	}
	log.Printf("[WS] Llamada rechazada por %s para %s", mh.Client.Telephon, callResp.To)
}

// HandleCallEnd maneja cuando alguien cuelga la llamada
func (mh *MessageHandler) HandleCallEnd() {
	var callEnd models.CallEnd
	if err := json.Unmarshal(mh.Payload, &callEnd); err != nil {
		log.Println("Error al deserializar call_end:", err)
		return
	}

	// Marcar la llamada como finalizada
	if mh.Client.ServiceCall != nil {
		ctx := context.Background()
		if err := mh.Client.ServiceCall.MarkCallEnded(callEnd.RoomID, ctx); err != nil {
			log.Printf("[WS] Error marcando llamada como finalizada: %v", err)
		}
	}

	_, otherConnected := mh.Hub.GetClient(callEnd.To)
	if otherConnected {
		notification := map[string]interface{}{
			"type": "call_ended",
			"payload": map[string]interface{}{
				"from":   mh.Client.Telephon,
				"roomID": callEnd.RoomID,
			},
		}
		notificationBytes, _ := json.Marshal(notification)
		mh.Hub.SendTo(callEnd.To, notificationBytes)
	}
	log.Printf("[WS] Llamada finalizada por %s con %s", mh.Client.Telephon, callEnd.To)
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
		safeSend(mh.Client.Send, errorMsg)
		return
	}
	responseMsg := map[string]interface{}{
		"type":    "delete_message",
		"payload": deletedMsg,
	}
	responseBytes, _ := json.Marshal(responseMsg)
	safeSend(mh.Client.Send, responseBytes)
	_, receptorConnected := mh.Hub.GetClient(msgDel.Receptor)
	if receptorConnected {
		mh.Hub.SendTo(msgDel.Receptor, responseBytes)
	}
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

	if msgSend.GroupID == 0 {
		mh.sendError("El ID del grupo es obligatorio")
		return
	}
	if len(msgSend.Message) == 0 && len(msgSend.MediaUrl) == 0 {
		mh.sendError("El mensaje no puede estar vacío")
		return
	}

	ctx := context.Background()
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

	// Auto-unir al sender a la room (auto-recuperación: garantiza que el sender
	// esté en la room incluso si su membresía se perdió por reconexión).
	mh.Hub.JoinRoom(msgSend.GroupID, mh.Client)

	// Confirmar al sender
	safeSend(mh.Client.Send, responseBytes)

	// Broadcast a todos los miembros conectados del grupo (excepto sender)
	mh.Hub.SendToGroup(msgSend.GroupID, mh.Client.Telephon, responseBytes)

	log.Printf("[WS-GROUP] Mensaje de %s en grupo %d, ID: %d", mh.Client.Telephon, msgSend.GroupID, savedMsg.MessageID)
}

// HandleGroupTyping notifica a los miembros conectados del grupo que alguien está escribiendo.
func (mh *MessageHandler) HandleGroupTyping() {
	var typing models.GroupTyping
	if err := json.Unmarshal(mh.Payload, &typing); err != nil {
		log.Println("[WS-GROUP] Error al deserializar group_typing:", err)
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
	var editData models.GroupMessageEdit
	if err := json.Unmarshal(mh.Payload, &editData); err != nil {
		log.Println("[WS-GROUP] Error al deserializar group_edit_message:", err)
		return
	}
	if editData.MessageID == 0 {
		mh.sendError("El ID del mensaje es obligatorio")
		return
	}

	// Extraer groupID del payload — lo añadimos como campo extra en el WS payload
	var rawPayload struct {
		models.GroupMessageEdit
		GroupID uint `json:"groupID"`
	}
	if err := json.Unmarshal(mh.Payload, &rawPayload); err != nil || rawPayload.GroupID == 0 {
		mh.sendError("El ID del grupo es obligatorio")
		return
	}

	ctx := context.Background()
	updatedMsg, err := mh.Client.ServiceGroup.EditGroupMessage(mh.Client.Telephon, rawPayload.GroupID, editData, ctx)
	if err != nil {
		log.Printf("[WS-GROUP] Error al editar mensaje de grupo: %v", err)
		mh.sendError("Error al editar mensaje: " + err.Error())
		return
	}

	responseBytes, _ := json.Marshal(map[string]interface{}{
		"type":    "group_edit_message",
		"payload": updatedMsg,
	})

	safeSend(mh.Client.Send, responseBytes)
	mh.Hub.SendToGroup(rawPayload.GroupID, mh.Client.Telephon, responseBytes)
}

// HandleGroupDeleteMessage gestiona la eliminación de un mensaje de grupo por WebSocket.
// Solo el autor puede eliminar; notifica a todos los miembros conectados.
func (mh *MessageHandler) HandleGroupDeleteMessage() {
	var rawPayload struct {
		models.GroupMessageDelete
		GroupID uint `json:"groupID"`
	}
	if err := json.Unmarshal(mh.Payload, &rawPayload); err != nil {
		log.Println("[WS-GROUP] Error al deserializar group_delete_message:", err)
		return
	}
	if rawPayload.MessageID == 0 || rawPayload.GroupID == 0 {
		mh.sendError("Los IDs de mensaje y grupo son obligatorios")
		return
	}

	ctx := context.Background()
	err := mh.Client.ServiceGroup.DeleteGroupMessage(mh.Client.Telephon, rawPayload.GroupID, rawPayload.GroupMessageDelete, ctx)
	if err != nil {
		log.Printf("[WS-GROUP] Error al eliminar mensaje de grupo: %v", err)
		mh.sendError("Error al eliminar mensaje: " + err.Error())
		return
	}

	responseBytes, _ := json.Marshal(map[string]interface{}{
		"type": "group_delete_message",
		"payload": map[string]interface{}{
			"MessageID": rawPayload.MessageID,
			"GroupID":   rawPayload.GroupID,
		},
	})

	safeSend(mh.Client.Send, responseBytes)
	mh.Hub.SendToGroup(rawPayload.GroupID, mh.Client.Telephon, responseBytes)
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

	ctx := context.Background()
	telephons, err := mh.Client.ServiceGroup.GetMemberTelephons(payload.GroupID, ctx)
	if err != nil {
		return
	}
	for _, t := range telephons {
		if t == mh.Client.Telephon {
			mh.Hub.JoinRoom(payload.GroupID, mh.Client)
			log.Printf("[WS-GROUP] %s joined room for group %d", mh.Client.Telephon, payload.GroupID)
			return
		}
	}
	log.Printf("[WS-GROUP] %s is NOT a member of group %d — join denied", mh.Client.Telephon, payload.GroupID)
}

// ─────────────────────────────────────────────────────────────────────────────
// Handlers de llamadas grupales
// ─────────────────────────────────────────────────────────────────────────────

// HandleGroupCallOffer inicia una llamada grupal: crea los call-logs y envía
// "incoming_call" a todos los miembros conectados del grupo (excepto el caller).
func (mh *MessageHandler) HandleGroupCallOffer() {
	var callOffer models.GroupCallOffer
	if err := json.Unmarshal(mh.Payload, &callOffer); err != nil {
		log.Println("[WS-GROUP-CALL] Error al deserializar group_call_offer:", err)
		return
	}

	ctx := context.Background()

	// Obtener miembros del grupo
	memberTelephons, err := mh.Client.ServiceGroup.GetMemberTelephons(callOffer.GroupID, ctx)
	if err != nil {
		log.Printf("[WS-GROUP-CALL] Error obteniendo miembros del grupo %d: %v", callOffer.GroupID, err)
		mh.sendError("Error al iniciar llamada grupal")
		return
	}

	// Obtener nombre del grupo para los call-logs y la notificación
	groupName := ""
	if detail, err := mh.Client.ServiceGroup.GetGroupDetail(mh.Client.Telephon, callOffer.GroupID, ctx); err == nil && detail != nil {
		groupName = detail.Name
	}

	// Registrar un CallLog por cada miembro (excepto el caller)
	if mh.Client.ServiceCall != nil {
		if err := mh.Client.ServiceCall.CreateGroupCallLogs(
			mh.Client.Telephon, memberTelephons,
			callOffer.GroupID, groupName,
			callOffer.RoomID, callOffer.CallType, ctx,
		); err != nil {
			log.Printf("[WS-GROUP-CALL] Error registrando logs de llamada grupal: %v", err)
		}
	}

	// Notificar a todos los miembros conectados (excepto el caller)
	notificationBytes, _ := json.Marshal(map[string]interface{}{
		"type": "incoming_call",
		"payload": map[string]interface{}{
			"from":      mh.Client.Telephon,
			"username":  mh.Client.Username,
			"roomID":    callOffer.RoomID,
			"callType":  callOffer.CallType,
			"groupID":   callOffer.GroupID,
			"groupName": groupName,
		},
	})

	for _, memberTelephon := range memberTelephons {
		if memberTelephon == mh.Client.Telephon {
			continue
		}
		if _, connected := mh.Hub.GetClient(memberTelephon); connected {
			mh.Hub.SendTo(memberTelephon, notificationBytes)
		}
	}

	log.Printf("[WS-GROUP-CALL] Llamada grupal iniciada por %s en grupo %d (sala: %s, tipo: %s)",
		mh.Client.Telephon, callOffer.GroupID, callOffer.RoomID, callOffer.CallType)
}

// HandleGroupCallEnd finaliza una llamada grupal: actualiza el call-log y
// notifica a todos los miembros del grupo (excepto quien la terminó).
func (mh *MessageHandler) HandleGroupCallEnd() {
	var callEnd models.GroupCallEnd
	if err := json.Unmarshal(mh.Payload, &callEnd); err != nil {
		log.Println("[WS-GROUP-CALL] Error al deserializar group_call_end:", err)
		return
	}

	ctx := context.Background()

	if mh.Client.ServiceCall != nil {
		if err := mh.Client.ServiceCall.MarkCallEnded(callEnd.RoomID, ctx); err != nil {
			log.Printf("[WS-GROUP-CALL] Error marcando llamada como finalizada: %v", err)
		}
	}

	// Notificar a todos en la room (excepto quien terminó la llamada)
	notificationBytes, _ := json.Marshal(map[string]interface{}{
		"type": "call_ended",
		"payload": map[string]interface{}{
			"from":    mh.Client.Telephon,
			"roomID":  callEnd.RoomID,
			"groupID": callEnd.GroupID,
		},
	})
	mh.Hub.SendToGroup(callEnd.GroupID, mh.Client.Telephon, notificationBytes)

	log.Printf("[WS-GROUP-CALL] Llamada grupal finalizada por %s en grupo %d", mh.Client.Telephon, callEnd.GroupID)
}

// sendError es un helper para enviar mensajes de error al cliente WebSocket.
func (mh *MessageHandler) sendError(msg string) {
	errorMsg, _ := json.Marshal(map[string]interface{}{
		"type":  "error",
		"error": msg,
	})
	safeSend(mh.Client.Send, errorMsg)
}
