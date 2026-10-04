package websocket

import (
	"context"
	"encoding/json"
	"gorm/backend/metrics"
	"gorm/backend/repos"
	"gorm/backend/services"
	"log"
	"sync"
	"time"
)

type Hub struct {
	mu      sync.RWMutex
	Clients map[string]*Client // Key: telephon (número de teléfono)

	// rooms: groupID → telephon → *Client
	// Permite hacer broadcast eficiente a todos los miembros conectados de un grupo.
	rooms map[uint]map[string]*Client

	Register  chan *Client
	Remove    chan *Client
	Broadcast chan []byte
	repo      *repos.ApiContact
	metrics   *metrics.Metrics

	// reactions atiende el evento WS `react` y los endpoints REST de reacciones;
	// se inyecta tras construir el hub (SetReactionService).
	reactions services.ReactionServicer

	// push dispara las notificaciones Web Push a destinatarios desconectados;
	// se inyecta tras construir el hub (SetPushNotifier). nil = no-op.
	push services.PushNotifier
}

// SetReactionService inyecta el servicio de reacciones usado por HandleReaction
// y por el handler REST (vía Reactions).
func (h *Hub) SetReactionService(s services.ReactionServicer) { h.reactions = s }

// Reactions devuelve el servicio de reacciones inyectado (nil si no hay).
func (h *Hub) Reactions() services.ReactionServicer { return h.reactions }

// SetPushNotifier inyecta el notificador Web Push usado por los handlers de
// mensajes (1:1 y grupo). Debe llamarse antes de aceptar conexiones.
func (h *Hub) SetPushNotifier(n services.PushNotifier) { h.push = n }

// PushNotifier devuelve el notificador inyectado o un no-op si no hay.
func (h *Hub) PushNotifier() services.PushNotifier {
	if h.push == nil {
		return services.NoopPushNotifier{}
	}
	return h.push
}

// NewHub crea e inicializa un Hub de WebSocket con el repositorio de datos y el
// conjunto de métricas (m puede ser nil: no se contabiliza nada).
func NewHub(repo *repos.ApiContact, m *metrics.Metrics) *Hub {
	return &Hub{
		Clients:   make(map[string]*Client),
		rooms:     make(map[uint]map[string]*Client),
		Register:  make(chan *Client),
		Remove:    make(chan *Client),
		Broadcast: make(chan []byte),
		repo:      repo,
		metrics:   m,
	}
}

// Stats devuelve una foto consistente de las colecciones del Hub: conexiones
// activas, rooms con al menos un miembro y total de membresías. Se lee bajo
// RLock para no bloquear a los pumps; los gauges la consultan solo en scrape.
func (h *Hub) Stats() metrics.HubStats {
	h.mu.RLock()
	defer h.mu.RUnlock()

	memberships := 0
	for _, room := range h.rooms {
		memberships += len(room)
	}
	return metrics.HubStats{
		Connections:     len(h.Clients),
		Rooms:           len(h.rooms),
		RoomMemberships: memberships,
	}
}

// messageSent/messageFailed cuentan el resultado de un envío persistido. Son
// nil-safe cuando el Hub se construye sin métricas (tests).
func (h *Hub) messageSent(kind string) {
	if h.metrics != nil {
		h.metrics.MessageSent(kind)
	}
}

func (h *Hub) messageFailed(kind string) {
	if h.metrics != nil {
		h.metrics.MessageFailed(kind)
	}
}

// Run arranca el bucle principal del Hub que atiende los canales Register,
// Remove y Broadcast (se mantienen por compatibilidad; internamente el registro
// y la baja se hacen de forma síncrona con RegisterClient / UnregisterClient).
func (h *Hub) Run() {
	for {
		select {
		case c := <-h.Register:
			h.RegisterClient(c)
		case c := <-h.Remove:
			h.UnregisterClient(c)
		case msg := <-h.Broadcast:
			h.mu.RLock()
			for _, c := range h.Clients {
				h.trySendLocked(c, msg)
			}
			h.mu.RUnlock()
		}
	}
}

// RegisterClient registra la conexión como la activa del usuario. Si existía una
// conexión anterior para el mismo teléfono, la cierra para que su writePump
// termine limpiamente y no interfiera con la nueva.
func (h *Hub) RegisterClient(c *Client) {
	h.mu.Lock()
	if oldClient, exists := h.Clients[c.Telephon]; exists && oldClient != c {
		oldClient.log().Info("ws conexión reemplazada")
		h.closeClientLocked(oldClient)
		// Limpiar las rooms del cliente viejo; el nuevo las reobtiene en initClient.
		h.leaveAllRoomsLocked(c.Telephon)
	}
	h.Clients[c.Telephon] = c
	total := len(h.Clients)
	h.mu.Unlock()
	if h.metrics != nil {
		h.metrics.WSConnectionsTotal.Inc()
	}
	c.log().Info("ws conectado", "total", total)
	// Notificar a los contactos que este usuario está online (sin bloquear)
	go h.NotifyContactsOnline(c.Telephon)
}

// UnregisterClient da de baja la conexión. Si ya fue reemplazada por una
// reconexión más reciente, solo la cierra (sin notificar offline).
func (h *Hub) UnregisterClient(c *Client) {
	h.mu.Lock()
	existing, ok := h.Clients[c.Telephon]
	current := ok && existing == c
	if current {
		delete(h.Clients, c.Telephon)
		h.leaveAllRoomsLocked(c.Telephon)
	}
	h.closeClientLocked(c)
	total := len(h.Clients)
	h.mu.Unlock()
	if h.metrics != nil {
		h.metrics.WSDisconnectsTotal.Inc()
	}

	if current {
		c.log().Info("ws desconectado", "total", total)
		// Notificar a los contactos que este usuario está offline (sin bloquear)
		go h.NotifyContactsOffline(c.Telephon)
	}
}

// closeClientLocked cierra el canal Send del cliente una sola vez.
// REQUIERE que h.mu.Lock() esté adquirido por el llamador: todos los envíos se
// hacen con al menos h.mu.RLock(), así nunca se envía a un canal cerrado.
func (h *Hub) closeClientLocked(c *Client) {
	if !c.closed {
		c.closed = true
		close(c.Send)
	}
}

// trySendLocked encola el mensaje sin bloquear. Devuelve false si el cliente
// está cerrado o su buffer está lleno (cliente lento).
// REQUIERE que h.mu esté adquirido (lectura o escritura) por el llamador.
func (h *Hub) trySendLocked(c *Client, msg []byte) bool {
	if c.closed {
		return false
	}
	select {
	case c.Send <- msg:
		return true
	default:
		// Solo el buffer lleno cuenta como drop: una conexión cerrada ya se
		// detecta arriba y no es un descarte.
		if h.metrics != nil {
			h.metrics.WSSendDroppedTotal.Inc()
		}
		return false
	}
}

// SendToClient envía un mensaje a una conexión concreta de forma segura:
// no bloquea y nunca entra en pánico aunque la conexión ya se haya cerrado.
func (h *Hub) SendToClient(c *Client, msg []byte) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.trySendLocked(c, msg)
}

// SendTo envía un mensaje privado a un usuario específico (chat 1 a 1) usando el telephon
func (h *Hub) SendTo(telephon string, msg []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	if client, exists := h.Clients[telephon]; exists {
		h.trySendLocked(client, msg)
	}
}

// GetClient obtiene un cliente de forma thread-safe usando el telephon
func (h *Hub) GetClient(telephon string) (*Client, bool) {
	h.mu.RLock()
	client, exists := h.Clients[telephon]
	h.mu.RUnlock()
	return client, exists
}

// IsOnline indica si el usuario tiene una conexión WebSocket activa.
func (h *Hub) IsOnline(telephon string) bool {
	_, ok := h.GetClient(telephon)
	return ok
}

// ─────────────────────────────────────────────────────────────────────────────
// Rooms (grupos de chat)
// ─────────────────────────────────────────────────────────────────────────────

// JoinRoom registra a un cliente en la room de un grupo.
// Llamado desde HandleWebSocket al conectar o después de crear/unirse a un grupo.
// Si la conexión ya no es la activa del usuario (se cerró o fue reemplazada)
// no se añade, para no dejar clientes muertos en las rooms.
func (h *Hub) JoinRoom(groupID uint, client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if client.closed || h.Clients[client.Telephon] != client {
		return
	}
	if h.rooms[groupID] == nil {
		h.rooms[groupID] = make(map[string]*Client)
	}
	h.rooms[groupID][client.Telephon] = client
}

// JoinRoomByTelephon añade a la room a un cliente identificado por su teléfono.
// Si el cliente no está conectado en ese momento, la llamada es un no-op.
func (h *Hub) JoinRoomByTelephon(groupID uint, telephon string) {
	client, exists := h.GetClient(telephon)
	if !exists {
		return
	}
	h.JoinRoom(groupID, client)
}

// LeaveRoomByTelephon saca al usuario de la room del grupo (p. ej. al salir del
// grupo) para que deje de recibir sus mensajes en tiempo real.
func (h *Hub) LeaveRoomByTelephon(groupID uint, telephon string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if room := h.rooms[groupID]; room != nil {
		delete(room, telephon)
		if len(room) == 0 {
			delete(h.rooms, groupID)
		}
	}
}

// IsInRoom indica si el usuario está en la room del grupo.
func (h *Hub) IsInRoom(groupID uint, telephon string) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	_, ok := h.rooms[groupID][telephon]
	return ok
}

// SendToGroup envía un mensaje a todos los miembros conectados de un grupo,
// excepto al sender.
func (h *Hub) SendToGroup(groupID uint, senderTelephon string, msg []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for telephon, client := range h.rooms[groupID] {
		if telephon != senderTelephon {
			h.trySendLocked(client, msg)
		}
	}
}

// leaveAllRoomsLocked elimina al cliente de todas las rooms.
// REQUIERE que h.mu.Lock() esté adquirido por el llamador.
func (h *Hub) leaveAllRoomsLocked(telephon string) {
	for groupID, room := range h.rooms {
		if _, exists := room[telephon]; exists {
			delete(room, telephon)
			// Si la room quedó vacía, limpiarla del mapa
			if len(room) == 0 {
				delete(h.rooms, groupID)
			}
		}
	}
}

// NotifyContactsOnline notifica a los contactos que un usuario está online (usa telephon)
func (h *Hub) NotifyContactsOnline(telephon string) {
	if h.repo == nil {
		return
	}
	contacts := h.getUserContactsTelephons(telephon)
	if len(contacts) == 0 {
		return
	}

	// Obtener el username para enviarlo en la notificación
	username, err := h.repo.GetUsernameByTelephon(telephon, context.Background())
	if err != nil {
		log.Printf("[HUB] Error obteniendo username para tel %s: %v", telephon, err)
		return
	}

	msg, _ := json.Marshal(map[string]interface{}{
		"type": "online",
		"payload": map[string]interface{}{
			"username": username,
			"telephon": telephon,
		},
	})
	h.sendToMany(contacts, msg)
}

// NotifyContactsOffline notifica a los contactos que un usuario está offline (usa telephon)
func (h *Hub) NotifyContactsOffline(telephon string) {
	if h.repo == nil {
		return
	}
	// Actualizar last_seen en la base de datos
	if err := h.repo.UpdateLastSeen(telephon, context.Background()); err != nil {
		log.Printf("[HUB] Error actualizando last_seen para tel %s: %v", telephon, err)
	}

	now := time.Now().UTC()
	contacts := h.getUserContactsTelephons(telephon)
	if len(contacts) == 0 {
		return
	}

	// Obtener el username para enviarlo en la notificación
	username, err := h.repo.GetUsernameByTelephon(telephon, context.Background())
	if err != nil {
		log.Printf("[HUB] Error obteniendo username para tel %s: %v", telephon, err)
		return
	}

	msg, _ := json.Marshal(map[string]interface{}{
		"type": "offline",
		"payload": map[string]interface{}{
			"username":  username,
			"telephon":  telephon,
			"last_seen": now.Format(time.RFC3339),
		},
	})
	h.sendToMany(contacts, msg)
}

// sendToMany envía el mismo mensaje a varios usuarios tomando el lock una sola vez.
func (h *Hub) sendToMany(telephons []string, msg []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, t := range telephons {
		if client, ok := h.Clients[t]; ok {
			h.trySendLocked(client, msg)
		}
	}
}

// GetOnlineContacts devuelve la lista de contactos de un usuario que están online (usa telephon)
func (h *Hub) GetOnlineContacts(telephon string) []string {
	contactTelephons := h.getUserContactsTelephons(telephon)
	onlineContacts := []string{}

	h.mu.RLock()
	for _, contactTelephon := range contactTelephons {
		if _, isOnline := h.Clients[contactTelephon]; isOnline {
			onlineContacts = append(onlineContacts, contactTelephon)
		}
	}
	h.mu.RUnlock()

	return onlineContacts
}

// getUserContactsTelephons obtiene la lista BIDIRECCIONAL de telephons relacionados:
// personas que YO tengo agregadas + personas que ME tienen agregado a mí.
// El repositorio la cachea en Redis (y la invalida al añadir contactos).
func (h *Hub) getUserContactsTelephons(telephon string) []string {
	if h.repo == nil {
		return []string{}
	}
	return h.repo.GetCachedContactsTelephons(telephon, context.Background())
}

// NotifyUsernameChange actualiza el username del cliente conectado y notifica
// a sus contactos el cambio.
func (h *Hub) NotifyUsernameChange(telephon string, oldUsername string, newUsername string) {
	if client, ok := h.GetClient(telephon); ok {
		client.SetUsername(newUsername)
	}

	contacts := h.getUserContactsTelephons(telephon)
	if len(contacts) == 0 {
		return
	}

	msg, _ := json.Marshal(map[string]interface{}{
		"type": "username_changed",
		"payload": map[string]interface{}{
			"old_username": oldUsername,
			"new_username": newUsername,
			"telephon":     telephon,
		},
	})
	h.sendToMany(contacts, msg)

	// Notificar que el usuario sigue en línea con el nuevo nombre
	if h.IsOnline(telephon) {
		onlineMsg, _ := json.Marshal(map[string]interface{}{
			"type": "online",
			"payload": map[string]interface{}{
				"username": newUsername,
				"telephon": telephon,
			},
		})
		h.sendToMany(contacts, onlineMsg)
	}
}

// NotifyAvatarChange notifica a los contactos que el usuario cambió su foto de perfil
func (h *Hub) NotifyAvatarChange(telephon string, avatarUrl string) {
	contacts := h.getUserContactsTelephons(telephon)

	msg, _ := json.Marshal(map[string]interface{}{
		"type": "avatar_changed",
		"payload": map[string]interface{}{
			"telephon":   telephon,
			"avatar_url": avatarUrl,
		},
	})

	// Notificar a todos los contactos y al propio usuario (para sincronizar otras sesiones)
	h.sendToMany(append(contacts, telephon), msg)
}
