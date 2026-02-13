package websocket

import (
	"context"
	"encoding/json"
	"fmt"
	"gorm/backend/repos"
	"sync"
)

type Hub struct {
	mu        sync.RWMutex
	Clients   map[string]*Client
	Register  chan *Client
	Remove    chan *Client
	Broadcast chan []byte
	repo      *repos.ApiContact
}

func NewHub(repo *repos.ApiContact) *Hub {
	return &Hub{
		Clients:   make(map[string]*Client),
		Register:  make(chan *Client),
		Remove:    make(chan *Client),
		Broadcast: make(chan []byte),
		repo:      repo,
	}
}

func (h *Hub) Run() {
	for {
		select {
		case c := <-h.Register:
			h.mu.Lock()
			h.Clients[c.Username] = c
			h.mu.Unlock()
			fmt.Printf("[HUB] Usuario registrado: %s. Total clientes: %d\n", c.Username, len(h.Clients))
			// Notificar a los contactos que este usuario está online
			h.NotifyContactsOnline(c.Username)

		case c := <-h.Remove:
			h.mu.Lock()
			delete(h.Clients, c.Username)
			h.mu.Unlock()
			fmt.Printf("[HUB] Usuario desconectado: %s. Total clientes: %d\n", c.Username, len(h.Clients))
			// Notificar a los contactos que este usuario está offline
			h.NotifyContactsOffline(c.Username)

		case msg := <-h.Broadcast:
			h.mu.RLock()
			for _, c := range h.Clients {
				c.Send <- msg
			}
			h.mu.RUnlock()
		}
	}
}

// SendTo envía un mensaje privado a un usuario específico (chat 1 a 1)
func (h *Hub) SendTo(username string, msg []byte) {
	h.mu.RLock()
	client, exists := h.Clients[username]
	h.mu.RUnlock()

	if exists {
		select {
		case client.Send <- msg:
		default:
			// Canal lleno, ignorar
		}
	}
}

// NotifyContactsOnline notifica a los contactos que un usuario está online
func (h *Hub) NotifyContactsOnline(username string) {
	contacts := h.getUserContacts(username)
	fmt.Printf("[HUB] NotifyContactsOnline para %s. Contactos encontrados: %v\n", username, contacts)
	msg, _ := json.Marshal(map[string]interface{}{
		"type": "online",
		"payload": map[string]interface{}{
			"username": username,
		},
	})

	for _, contactUsername := range contacts {
		fmt.Printf("[HUB] Enviando notificación online de %s a %s\n", username, contactUsername)
		h.SendTo(contactUsername, msg)
	}
}

// NotifyContactsOffline notifica a los contactos que un usuario está offline
func (h *Hub) NotifyContactsOffline(username string) {
	contacts := h.getUserContacts(username)
	msg, _ := json.Marshal(map[string]interface{}{
		"type": "offline",
		"payload": map[string]interface{}{
			"username": username,
		},
	})

	for _, contactUsername := range contacts {
		h.SendTo(contactUsername, msg)
	}
}

// GetOnlineContacts devuelve la lista de contactos de un usuario que están online
func (h *Hub) GetOnlineContacts(username string) []string {
	contacts := h.getUserContacts(username)
	onlineContacts := []string{}

	h.mu.RLock()
	for _, contactUsername := range contacts {
		if _, isOnline := h.Clients[contactUsername]; isOnline {
			onlineContacts = append(onlineContacts, contactUsername)
		}
	}
	h.mu.RUnlock()

	fmt.Printf("[HUB] GetOnlineContacts para %s. Total contactos: %d, Online: %d (%v)\n", username, len(contacts), len(onlineContacts), onlineContacts)
	return onlineContacts
}

// getUserContacts obtiene la lista de usernames de contactos de un usuario
func (h *Hub) getUserContacts(username string) []string {
	if h.repo == nil {
		return []string{}
	}

	// Obtener el ID del usuario
	id, err := h.repo.GetIdUsername(username, context.Background())
	if err != nil {
		return []string{}
	}

	// Obtener contactos
	contacts, err := h.repo.GetContactsNumber(uint(id), context.Background())
	if err != nil || contacts == nil {
		return []string{}
	}

	usernames := []string{}
	for _, contact := range *contacts {
		if contact.Status == "accepted" {
			usernames = append(usernames, contact.Username)
		}
	}

	return usernames
}
