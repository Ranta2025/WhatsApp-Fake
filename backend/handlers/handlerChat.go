package handlers

import (
	"encoding/json"
	"errors"
	"gorm/backend/models"
	"gorm/backend/services"
	"gorm/backend/websocket"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// DirectNotifier es lo mínimo del Hub que necesita HandlerChat para notificar
// por WS cambios de ajustes del chat 1:1.
type DirectNotifier interface {
	SendTo(telephon string, msg []byte)
}

type HandlerChat struct {
	service  services.ChatServicer
	hub      *websocket.Hub
	notifier DirectNotifier        // nil si no hay Hub
	mutes    services.MuteServicer // nil = los listados salen sin estado de silencio
}

// SetMuteService inyecta el servicio de silencios que rellena Muted/MutedUntil
// del listado de chats.
func (hd *HandlerChat) SetMuteService(m services.MuteServicer) { hd.mutes = m }

// InitHandlerChat crea el handler de chat con su servicio y referencia al Hub WebSocket.
func InitHandlerChat(service services.ChatServicer, hub *websocket.Hub) *HandlerChat {
	h := &HandlerChat{service: service, hub: hub}
	if hub != nil {
		h.notifier = hub
	}
	return h
}

// chatErrorStatus mapea un mensaje inexistente, expirado o ajeno (1:1) a 404,
// un clientID inválido a 400 y uno reutilizado en otro chat a 409; cualquier
// otro error sigue siendo 500.
func chatErrorStatus(err error) int {
	switch {
	case errors.Is(err, models.ErrMessageNotFound):
		return http.StatusNotFound
	case errors.Is(err, services.ErrInvalidClientID):
		return http.StatusBadRequest
	case errors.Is(err, services.ErrClientIDConflict):
		return http.StatusConflict
	}
	return http.StatusInternalServerError
}

// HandlerPostChat persiste un nuevo mensaje de chat en base de datos.
// Los datos del mensaje ya vienen validados por MiddlewareChat.
func (hd *HandlerChat) HandlerPostChat() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exist := ctx.Get("telephon")
		message, exist2 := ctx.Get("message")
		if !(exist && exist2) {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"error": "error al obtener los datos",
			})
			ctx.Abort()
			return
		}
		messageExtract := models.MessageCreat{
			MessageGet: message.(models.MessageGet),
			Telephon:   telephon.(string),
		}

		message, err := hd.service.ServiceCreatMessage(messageExtract, ctx)
		if err != nil {
			respondChatError(ctx, err)
			ctx.Abort()
			return
		}
		ctx.JSON(http.StatusOK, gin.H{
			"message": message,
		})
	}
}

// HandlerGetChats devuelve el historial de mensajes entre el usuario autenticado
// y el contacto indicado en el parámetro :contact.
func (hd *HandlerChat) HandlerGetChats() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		// Usar telephon del token (identificador inmutable)
		telephon, exist := ctx.Get("telephon")
		contact, exist2 := ctx.Get("contact")
		if !(exist && exist2) {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"error": "error al obtener los datos",
			})
			ctx.Abort()
			return
		}
		// Ventanas para "ir al mensaje" (búsqueda): around=<id> devuelve una
		// ventana centrada y after=<id> los mensajes posteriores. El cuerpo sigue
		// siendo un array; los flags viajan en X-Has-More-Older/Newer.
		if around, ok := parsePositiveID(ctx.Query("around")); ok {
			_, limit := parseSearchPaging(ctx)
			msgs, hasOlder, hasNewer, err := hd.service.ServiceGetMessagesAround(telephon.(string), contact.(string), around, limit, ctx)
			if err != nil {
				respondWindowError(ctx, err)
				return
			}
			ctx.Header("X-Has-More-Older", strconv.FormatBool(hasOlder))
			ctx.Header("X-Has-More-Newer", strconv.FormatBool(hasNewer))
			ctx.IndentedJSON(http.StatusOK, msgs)
			return
		}
		if after, ok := parsePositiveID(ctx.Query("after")); ok {
			_, limit := parseSearchPaging(ctx)
			msgs, hasNewer, err := hd.service.ServiceGetMessagesAfter(telephon.(string), contact.(string), after, limit, ctx)
			if err != nil {
				respondWindowError(ctx, err)
				return
			}
			ctx.Header("X-Has-More-Newer", strconv.FormatBool(hasNewer))
			ctx.IndentedJSON(http.StatusOK, msgs)
			return
		}

		// Paginación opcional: sin before ni limit válidos, limit=0 conserva el
		// comportamiento histórico (últimos 200). Con cualquiera, la página
		// por defecto es de 50 (el servicio acota el máximo).
		var before uint
		hasBefore := false
		if b, err := strconv.ParseUint(ctx.Query("before"), 10, 32); err == nil && b > 0 {
			before = uint(b)
			hasBefore = true
		}
		limit := 0
		if l, err := strconv.Atoi(ctx.Query("limit")); err == nil && l > 0 {
			limit = l
		} else if hasBefore {
			limit = 50
		}

		message, hasMore, err := hd.service.ServiceGetMessagesPage(telephon.(string), contact.(string), before, limit, ctx)
		if err != nil {
			respondInternal(ctx, err)
			ctx.Abort()
			return
		}
		ctx.Header("X-Has-More", strconv.FormatBool(hasMore))
		ctx.IndentedJSON(http.StatusOK, message)
	}
}

// HandlerSearchChat busca mensajes de texto en la conversación con :contact.
// Query params: q (2–100 caracteres), before (id, pagina hacia atrás) y limit.
func (hd *HandlerChat) HandlerSearchChat() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exist := ctx.Get("telephon")
		contact, exist2 := ctx.Get("contact")
		if !(exist && exist2) {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "error al obtener los datos"})
			ctx.Abort()
			return
		}
		before, limit := parseSearchPaging(ctx)
		page, err := hd.service.ServiceSearchMessages(telephon.(string), contact.(string), ctx.Query("q"), before, limit, ctx)
		if err != nil {
			respondSearchError(ctx, err)
			return
		}
		ctx.JSON(http.StatusOK, page)
	}
}

// HandlerPutChat marca como 'visto' los mensajes enviados por el contacto
// al usuario autenticado para la conversación especificada.
func (hd *HandlerChat) HandlerPutChat() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		// Usar telephon del token (identificador inmutable)
		telephon, exist := ctx.Get("telephon")
		contact, exist2 := ctx.Get("contact")
		if !(exist && exist2) {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"error": "error al obtener los datos",
			})
			return
		}

		err := hd.service.ServicePutMessageStatusDelivered(telephon.(string), contact.(string), ctx)
		if err != nil {
			respondInternal(ctx, err)
			return
		}

		ctx.JSON(http.StatusOK, gin.H{
			"message": "Mensajes actualizado a visto",
		})
	}
}

// HandlerGetAllChats devuelve todos los chats del usuario agrupados por contacto.
// Si IsContact=false el front debe mostrar opciones para agregar o bloquear al remitente.
func (hd *HandlerChat) HandlerGetAllChats() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exist := ctx.Get("telephon")
		if !exist {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"error": "error al obtener los datos",
			})
			ctx.Abort()
			return
		}
		chats, err := hd.service.ServiceGetAllChats(telephon.(string), ctx)
		if err != nil {
			respondInternal(ctx, err)
			ctx.Abort()
			return
		}
		if hd.mutes != nil {
			if err := hd.mutes.DecorateChats(telephon.(string), chats, ctx); err != nil {
				logMuteDecorateError(ctx, "chats", err)
			}
		}
		ctx.IndentedJSON(http.StatusOK, chats)
	}
}

func (hd *HandlerChat) HandlerPutAllChat() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exist := ctx.Get("telephon")
		if !exist {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"error": "error al obtener los datos",
			})
			return
		}

		// Obtener remitentes con mensajes pendientes ANTES de actualizar
		senders, err := hd.service.ServiceGetSendersAndMarkDelivered(telephon.(string), ctx)
		if err != nil {
			respondInternal(ctx, err)
			return
		}

		// Notificar por WS a cada remitente que sus mensajes fueron entregados
		if hd.hub != nil && len(senders) > 0 {
			msg, _ := json.Marshal(map[string]interface{}{
				"type": "message_delivered",
				"payload": map[string]interface{}{
					"receiver": telephon.(string),
				},
			})
			for _, senderTel := range senders {
				hd.hub.SendTo(senderTel, msg)
			}
		}

		ctx.JSON(http.StatusOK, gin.H{
			"message": "Mensajes actualizados a entregado",
		})
	}
}

func (hd *HandlerChat) HandlerEditMessage() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exist := ctx.Get("telephon")
		msgEditInterface, exist2 := ctx.Get("messageEdit")

		if !(exist && exist2) {
			ctx.JSON(http.StatusBadRequest, gin.H{
				"error": "error al obtener los datos",
			})
			return
		}

		msgEdit := msgEditInterface.(models.MessageEdit)

		updatedMsg, err := hd.service.ServiceEditMessage(telephon.(string), msgEdit.MessageID, msgEdit.Message, ctx)
		if err != nil {
			respondChatError(ctx, err)
			return
		}

		ctx.JSON(http.StatusOK, updatedMsg)
	}
}

// HandlerClearChat borra el historial del chat para el usuario autenticado.
// Los datos vienen extraídos por MiddlewareClearChat.
func (hd *HandlerChat) HandlerClearChat() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephonUser, exist := ctx.Get("telephon")
		telephonContact, exist2 := ctx.Get("contact")
		if !exist || !exist2 {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "error al obtener los datos"})
			return
		}

		if err := hd.service.ServiceClearChat(telephonUser.(string), telephonContact.(string), ctx); err != nil {
			respondInternal(ctx, err)
			return
		}

		ctx.JSON(http.StatusOK, gin.H{"message": "Chat vaciado correctamente"})
	}
}

// HandlerDeleteMessageForMe elimina un mensaje solo para el usuario autenticado.
// El ID del mensaje viene validado por MiddlewareDeleteMessage.
func (hd *HandlerChat) HandlerDeleteMessageForMe() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephonUser, exist := ctx.Get("telephon")
		messageID, exist2 := ctx.Get("messageID")
		if !exist || !exist2 {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "error al obtener los datos"})
			return
		}

		deletedMsg, err := hd.service.ServiceDeleteMessageForMe(telephonUser.(string), messageID.(uint), ctx)
		if err != nil {
			respondChatError(ctx, err)
			return
		}

		ctx.JSON(http.StatusOK, deletedMsg)
	}
}

// disappearingBody es el cuerpo de PUT .../disappearing. Seconds es puntero para
// distinguir "0" (apagar) de "ausente".
type disappearingBody struct {
	Seconds *int `json:"seconds"`
}

// HandlerSetDisappearing cambia el temporizador del chat 1:1 con :contact
// (cualquiera de los dos participantes). Responde con el sobre
// {kind,key,seconds,byTelephon,systemMessage} y, solo si cambió, lo difunde por
// WS (`disappearing_changed`) a ambos usuarios.
func (hd *HandlerChat) HandlerSetDisappearing() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exist := ctx.Get("telephon")
		contact, exist2 := ctx.Get("contact")
		if !(exist && exist2) {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "error al obtener los datos"})
			return
		}
		var body disappearingBody
		if err := ctx.ShouldBindJSON(&body); err != nil || body.Seconds == nil {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "Debes indicar los segundos"})
			return
		}
		actor, other := telephon.(string), contact.(string)
		changed, sysMsg, err := hd.service.SetChatDisappearing(actor, other, *body.Seconds, ctx)
		if err != nil {
			switch {
			case errors.Is(err, services.ErrChatContactNotFound), errors.Is(err, models.ErrUserNotFound):
				respondFailure(ctx, http.StatusNotFound, err)
			case errors.Is(err, models.ErrInvalidDisappearDuration):
				respondFailure(ctx, http.StatusBadRequest, err)
			default:
				respondInternal(ctx, err)
			}
			return
		}
		envelope := func(key string) gin.H {
			return gin.H{
				"kind":          "direct",
				"key":           key,
				"seconds":       *body.Seconds,
				"byTelephon":    actor,
				"systemMessage": sysMsg,
			}
		}
		if changed && hd.notifier != nil {
			// Cada participante recibe como clave el teléfono del OTRO.
			for recipient, key := range map[string]string{actor: other, other: actor} {
				msg, mErr := json.Marshal(map[string]interface{}{
					"type":    "disappearing_changed",
					"payload": envelope(key),
				})
				if mErr == nil {
					hd.notifier.SendTo(recipient, msg)
				}
			}
		}
		ctx.JSON(http.StatusOK, envelope(other))
	}
}

// HandlerGetChatSettings devuelve los ajustes del chat 1:1 con :contact.
func (hd *HandlerChat) HandlerGetChatSettings() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		telephon, exist := ctx.Get("telephon")
		contact, exist2 := ctx.Get("contact")
		if !(exist && exist2) {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "error al obtener los datos"})
			return
		}
		seconds, err := hd.service.GetChatDisappearing(telephon.(string), contact.(string), ctx)
		if err != nil {
			if errors.Is(err, services.ErrChatContactNotFound) || errors.Is(err, models.ErrUserNotFound) {
				respondFailure(ctx, http.StatusNotFound, err)
				return
			}
			respondInternal(ctx, err)
			return
		}
		ctx.JSON(http.StatusOK, gin.H{"disappearSeconds": seconds})
	}
}
