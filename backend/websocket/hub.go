package websocket

import (
	"log"
	"sync"
)

// BroadcastMessage mensaje para broadcast
type BroadcastMessage struct {
	Message []byte
	Client  *Client
}

// Hub mantiene el conjunto de clientes activos y broadcast mensajes
type Hub struct {
	// Clientes registrados (username -> Client)
	clients map[string]*Client

	// Mensajes de broadcast de los clientes
	Broadcast chan *BroadcastMessage

	// Registrar requests de los clientes
	Register chan *Client

	// Unregister requests de los clientes
	Unregister chan *Client

	// Mutex para operaciones concurrentes
	mu sync.RWMutex

	// Callback para procesar mensajes
	MessageHandler func(*Client, []byte)

	// Callback cuando usuario se conecta
	OnConnect func(string, *Client)

	// Callback cuando usuario se desconecta
	OnDisconnect func(string)
}

// NewHub crea una nueva instancia de Hub
func NewHub() *Hub {
	return &Hub{
		Broadcast:  make(chan *BroadcastMessage),
		Register:   make(chan *Client),
		Unregister: make(chan *Client),
		clients:    make(map[string]*Client),
	}
}

// Run inicia el hub
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.Register:
			h.mu.Lock()
			h.clients[client.Username] = client
			h.mu.Unlock()

			log.Printf("Cliente conectado: %s (Total: %d)", client.Username, len(h.clients))

			if h.OnConnect != nil {
				h.OnConnect(client.Username, client)
			}

		case client := <-h.Unregister:
			h.mu.Lock()
			if _, ok := h.clients[client.Username]; ok {
				delete(h.clients, client.Username)
				close(client.Send)
				log.Printf("Cliente desconectado: %s (Total: %d)", client.Username, len(h.clients))

				if h.OnDisconnect != nil {
					h.OnDisconnect(client.Username)
				}
			}
			h.mu.Unlock()

		case broadcastMsg := <-h.Broadcast:
			if h.MessageHandler != nil {
				h.MessageHandler(broadcastMsg.Client, broadcastMsg.Message)
			}
		}
	}
}

// GetClient obtiene un cliente por username
func (h *Hub) GetClient(username string) (*Client, bool) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	client, ok := h.clients[username]
	return client, ok
}

// IsOnline verifica si un usuario está conectado
func (h *Hub) IsOnline(username string) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	_, ok := h.clients[username]
	return ok
}

// GetOnlineUsers devuelve lista de usuarios conectados
func (h *Hub) GetOnlineUsers() []string {
	h.mu.RLock()
	defer h.mu.RUnlock()

	users := make([]string, 0, len(h.clients))
	for username := range h.clients {
		users = append(users, username)
	}
	return users
}

// SendToUser envía un mensaje a un usuario específico
func (h *Hub) SendToUser(username string, data []byte) bool {
	h.mu.RLock()
	client, ok := h.clients[username]
	h.mu.RUnlock()

	if !ok {
		return false
	}

	select {
	case client.Send <- data:
		return true
	default:
		return false
	}
}

// BroadcastToUsers envía mensaje a múltiples usuarios
func (h *Hub) BroadcastToUsers(usernames []string, data []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	for _, username := range usernames {
		if client, ok := h.clients[username]; ok {
			select {
			case client.Send <- data:
			default:
				// Canal lleno, skip
			}
		}
	}
}

// GetClientCount devuelve el número de clientes conectados
func (h *Hub) GetClientCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}
