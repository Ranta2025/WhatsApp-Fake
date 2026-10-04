package websocket

import (
	"context"
	"encoding/json"
	"gorm/backend/metrics"
	"gorm/backend/models"
	"gorm/backend/schemas"
	"gorm/backend/services"
	"log/slog"
	"net/http"
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
		mh.Client.log().Error("ws error serializando evento", "type", eventType, "err", err)
		return
	}
	mh.Hub.SendTo(to, msg)
}

// HandleChatMessage maneja el envío de mensajes de chat
func (mh *MessageHandler) HandleChatMessage() {
	var msgGet models.MessageGet
	if err := json.Unmarshal(mh.Payload, &msgGet); err != nil {
		mh.Client.log().Warn("ws error al deserializar mensaje", "type", "chat", "err", err)
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
		mh.Client.log().Error("ws error al guardar mensaje", "type", "chat", "err", err)
		mh.Hub.messageFailed(metrics.KindDirect)
		mh.sendError("Error al enviar mensaje: " + err.Error())
		return
	}

	responseBytes, _ := json.Marshal(map[string]interface{}{
		"type":    "chat",
		"payload": messageSaved,
	})

	// A replayed clientID only re-acks the sender with the stored message: no
	// second delivery to the receiver and no metrics/side effects.
	if messageSaved.Duplicate {
		mh.reply(responseBytes)
		return
	}
	mh.Hub.messageSent(metrics.KindDirect)

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
		mh.Client.log().Warn("ws error al deserializar mensaje", "type", "read", "err", err)
		return
	}

	// Actualizar a "visto" los mensajes que msgRead.From envió a este usuario
	ctx, cancel := mh.context()
	defer cancel()
	if err := mh.Client.ServiceChat.ServicePutMessageStatusDelivered(msgRead.From, mh.Client.Telephon, ctx); err != nil {
		mh.Client.log().Error("ws error al actualizar mensajes a visto", "type", "read", "err", err)
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
		mh.Client.log().Warn("ws error al deserializar mensaje", "type", "edit_message", "err", err)
		return
	}

	ctx, cancel := mh.context()
	defer cancel()
	updatedMsg, err := mh.Client.ServiceChat.ServiceEditMessage(mh.Client.Telephon, msgEdit.MessageID, msgEdit.Message, ctx)
	if err != nil {
		mh.Client.log().Error("ws error al editar mensaje", "type", "edit_message", "err", err)
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
		mh.Client.log().Warn("ws error al deserializar mensaje", "type", "delete_message", "err", err)
		return
	}

	ctx, cancel := mh.context()
	defer cancel()
	deletedMsg, err := mh.Client.ServiceChat.ServiceDeleteMessage(mh.Client.Telephon, msgDel.MessageID, ctx)
	if err != nil {
		mh.Client.log().Error("ws error al eliminar mensaje", "type", "delete_message", "err", err)
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
		mh.Client.log().Warn("ws mensaje inválido", "type", "call_offer", "err", err)
		return
	}

	// Registrar la llamada; si los datos no son válidos no se reenvía la oferta
	if mh.Client.ServiceCall != nil {
		ctx, cancel := mh.context()
		err := mh.Client.ServiceCall.CreateCallLog(mh.Client.Telephon, callOffer.To, callOffer.RoomID, callOffer.CallType, ctx)
		cancel()
		if err != nil {
			mh.Client.log().Error("ws error registrando llamada", "type", "call_offer", "err", err)
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
				caller.log().Error("ws error marcando llamada como no disponible", "type", "call_offer", "err", err)
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
		mh.Client.log().Warn("ws mensaje inválido", "type", eventType, "err", err)
		return
	}

	if update != nil {
		ctx, cancel := mh.context()
		err := update(callResp.RoomID, mh.Client.Telephon, ctx)
		cancel()
		if err != nil {
			// El usuario no participa en esa llamada (o no existe): no reenviar
			mh.Client.log().Warn("ws evento de llamada rechazado", "type", eventType, "room_id", callResp.RoomID, "err", err)
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
		mh.Client.log().Warn("ws error al deserializar mensaje", "type", "group_chat", "err", err)
		return
	}

	ctx, cancel := mh.context()
	defer cancel()
	savedMsg, err := mh.Client.ServiceGroup.SendGroupMessage(mh.Client.Telephon, msgSend, ctx)
	if err != nil {
		mh.Client.log().Error("ws error al guardar mensaje de grupo", "type", "group_chat", "err", err)
		mh.Hub.messageFailed(metrics.KindGroup)
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
	// A replayed clientID only re-acks the sender: no second broadcast/metrics.
	if savedMsg.Duplicate {
		return
	}
	mh.Hub.messageSent(metrics.KindGroup)
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

	// El typing sigue la matriz de envío: un miembro restringido (solo admins
	// pueden enviar) no puede mostrarse "escribiendo". Se suprime en silencio,
	// sin `error` ni difusión. La comprobación (rol + settings) es una lectura
	// indexada por evento; el cliente ya limita la frecuencia del typing.
	ctx, cancel := mh.context()
	defer cancel()
	if err := mh.Client.ServiceGroup.RequireCanSend(mh.Client.Telephon, typing.GroupID, ctx); err != nil {
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
		mh.Client.log().Warn("ws error al deserializar mensaje", "type", "group_edit_message", "err", err)
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
		mh.Client.log().Error("ws error al editar mensaje de grupo", "type", "group_edit_message", "err", err)
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
		mh.Client.log().Warn("ws error al deserializar mensaje", "type", "group_delete_message", "err", err)
		return
	}
	if payload.MessageID == 0 || payload.GroupID == 0 {
		mh.sendError("Los IDs de mensaje y grupo son obligatorios")
		return
	}

	ctx, cancel := mh.context()
	defer cancel()
	if err := mh.Client.ServiceGroup.DeleteGroupMessage(mh.Client.Telephon, payload.GroupID, payload.GroupMessageDelete, ctx); err != nil {
		mh.Client.log().Error("ws error al eliminar mensaje de grupo", "type", "group_delete_message", "err", err)
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
	mh.Client.log().Warn("ws join denegado: no es miembro del grupo", "type", "group_join", "group_id", payload.GroupID)
}

// allGroupMessages pide avanzar la marca hasta el último mensaje del grupo;
// el repositorio la acota al máximo id existente.
const allGroupMessages = ^uint(0)

// publishGroupReceipt avisa a los miembros conectados del grupo (salvo a quien
// originó el acuse) de que sus marcas de agua avanzaron. Los clientes solo lo
// usan para pintar los ticks de sus propios mensajes.
func publishGroupReceipt(hub *Hub, update *schemas.GroupReceiptUpdate) {
	msg, err := json.Marshal(map[string]interface{}{
		"type":    "group_receipt",
		"payload": update,
	})
	if err != nil {
		slog.Error("ws error serializando group_receipt", "type", "group_receipt", "err", err)
		return
	}
	hub.SendToGroup(update.GroupID, update.Telephon, msg)
}

// HandleGroupDelivered registra que el cliente recibió mensajes del grupo hasta
// `messageID` (acuse de entrega). Exige membresía; los fallos solo se registran
// en el log porque es un acuse automático, sin feedback al usuario.
func (mh *MessageHandler) HandleGroupDelivered() {
	var payload struct {
		GroupID   uint `json:"groupID"`
		MessageID uint `json:"messageID"`
	}
	if err := json.Unmarshal(mh.Payload, &payload); err != nil || payload.GroupID == 0 || payload.MessageID == 0 {
		return
	}
	ctx, cancel := mh.context()
	defer cancel()
	update, err := mh.Client.ServiceGroup.AdvanceGroupDelivered(mh.Client.Telephon, payload.GroupID, payload.MessageID, ctx)
	if err != nil {
		mh.Client.log().Warn("ws group_delivered rechazado", "type", "group_delivered", "group_id", payload.GroupID, "err", err)
		return
	}
	if update != nil {
		publishGroupReceipt(mh.Hub, update)
	}
}

// HandleGroupRead registra que el cliente leyó el grupo hasta `upToMessageID`
// (implica entregado). Misma política de errores que HandleGroupDelivered.
func (mh *MessageHandler) HandleGroupRead() {
	var payload struct {
		GroupID       uint `json:"groupID"`
		UpToMessageID uint `json:"upToMessageID"`
	}
	if err := json.Unmarshal(mh.Payload, &payload); err != nil || payload.GroupID == 0 || payload.UpToMessageID == 0 {
		return
	}
	ctx, cancel := mh.context()
	defer cancel()
	update, err := mh.Client.ServiceGroup.AdvanceGroupRead(mh.Client.Telephon, payload.GroupID, payload.UpToMessageID, ctx)
	if err != nil {
		mh.Client.log().Warn("ws group_read rechazado", "type", "group_read", "group_id", payload.GroupID, "err", err)
		return
	}
	if update != nil {
		publishGroupReceipt(mh.Hub, update)
	}
}

// marshalReactionJSON is a seam so tests can force a serialization failure.
var marshalReactionJSON = json.Marshal

// reactionEventBytes serializa el evento `reaction` ({type, payload}).
func reactionEventBytes(ch *services.ReactionChange) ([]byte, error) {
	return marshalReactionJSON(map[string]interface{}{
		"type":    "reaction",
		"payload": ch.Event(),
	})
}

// PublishReaction difunde un cambio de reacción: al actor (por su conexión si
// viene de WS, o por teléfono si viene de REST) y a los demás destinatarios (el
// otro participante en 1:1; los miembros conectados del grupo). Un cambio nulo
// o sin efecto (Changed=false) no se difunde.
func (h *Hub) PublishReaction(ch *services.ReactionChange, actor *Client) {
	if ch == nil || !ch.Changed {
		return
	}
	msg, err := reactionEventBytes(ch)
	if err != nil {
		slog.Error("ws error serializando reaction", "type", "reaction", "err", err)
		return
	}
	if actor != nil {
		h.SendToClient(actor, msg)
	} else {
		h.SendTo(ch.ActorTelephon, msg)
	}
	switch ch.Kind {
	case models.ReactionKindDirect:
		if ch.OtherTelephon != "" && ch.OtherTelephon != ch.ActorTelephon {
			h.SendTo(ch.OtherTelephon, msg)
		}
	case models.ReactionKindGroup:
		h.SendToGroup(ch.GroupID, ch.ActorTelephon, msg)
	}
}

// HandleReaction gestiona `react`: fija (emoji) o quita (emoji vacío) la reacción
// del usuario a un mensaje 1:1 o de grupo y difunde el evento `reaction`. Los
// errores responden al emisor con {type:"error", error, context:{action:"react",
// kind, messageID, groupID?, status}} para que el cliente revierta su
// actualización optimista. Un no-op (Changed=false) no se difunde pero se
// devuelve como eco solo a la conexión del actor, con el estado actual.
func (mh *MessageHandler) HandleReaction() {
	var payload struct {
		Kind      string `json:"kind"`
		MessageID uint   `json:"messageID"`
		GroupID   uint   `json:"groupID"`
		Emoji     string `json:"emoji"`
	}
	if err := json.Unmarshal(mh.Payload, &payload); err != nil || payload.MessageID == 0 {
		mh.sendReactionError("Solicitud de reacción inválida", http.StatusBadRequest, payload.Kind, payload.MessageID, payload.GroupID)
		return
	}
	if mh.Hub.reactions == nil {
		mh.sendReactionError("Reacciones no disponibles", http.StatusInternalServerError, payload.Kind, payload.MessageID, payload.GroupID)
		return
	}

	ctx, cancel := mh.context()
	defer cancel()
	change, err := mh.Hub.reactions.React(mh.Client.Telephon, payload.Kind, payload.MessageID, payload.GroupID, payload.Emoji, ctx)
	if err != nil {
		status := services.ReactionErrorStatus(err)
		msg := err.Error()
		if status == http.StatusInternalServerError {
			mh.Client.log().Error("ws error al reaccionar", "type", "react", "err", err)
			msg = "Error al reaccionar"
		}
		mh.sendReactionError(msg, status, payload.Kind, payload.MessageID, payload.GroupID)
		return
	}
	if change != nil && !change.Changed {
		// No-op: nobody else needs to hear about it, but the actor's optimistic
		// state may be stale, so echo the current state to this connection only.
		echo := *change
		echo.PreviousEmoji = echo.Emoji
		msg, err := reactionEventBytes(&echo)
		if err != nil {
			// Reply with an error so the client's pending-send queue drains.
			mh.Client.log().Error("ws error serializando eco de reaction", "type", "react", "err", err)
			mh.sendReactionError("Error al reaccionar", http.StatusInternalServerError, payload.Kind, payload.MessageID, payload.GroupID)
			return
		}
		mh.reply(msg)
		return
	}
	mh.Hub.PublishReaction(change, mh.Client)
}

// sendReactionError responde al emisor con el error y el contexto de la reacción.
func (mh *MessageHandler) sendReactionError(msg string, status int, kind string, messageID, groupID uint) {
	ctxInfo := map[string]interface{}{
		"action": "react", "kind": kind, "messageID": messageID, "status": status,
	}
	if groupID != 0 {
		ctxInfo["groupID"] = groupID
	}
	errorMsg, _ := json.Marshal(map[string]interface{}{
		"type":    "error",
		"error":   msg,
		"context": ctxInfo,
	})
	mh.reply(errorMsg)
}

// sendError es un helper para enviar mensajes de error al cliente WebSocket.
func (mh *MessageHandler) sendError(msg string) {
	errorMsg, _ := json.Marshal(map[string]interface{}{
		"type":  "error",
		"error": msg,
	})
	mh.reply(errorMsg)
}
