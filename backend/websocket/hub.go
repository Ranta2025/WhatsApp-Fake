package websocket

import (
	"context"
	"encoding/json"
	"fmt"
	"gorm/backend/models"
	"gorm/backend/repos"
	"sync"
	"time"
)

type Hub struct {
	mu        sync.RWMutex
	Clients   map[string]*Client // Key: telephon (número de teléfono)
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
			h.Clients[c.Telephon] = c
			h.mu.Unlock()
			fmt.Printf("[HUB] Usuario registrado: %s (tel: %s). Total clientes: %d\n", c.Username, c.Telephon, len(h.Clients))
			// Notificar a los contactos que este usuario está online (en goroutine para no bloquear el hub)
			go h.NotifyContactsOnline(c.Telephon)

		case c := <-h.Remove:
			h.mu.Lock()
			delete(h.Clients, c.Telephon)
			h.mu.Unlock()
			fmt.Printf("[HUB] Usuario desconectado: %s (tel: %s). Total clientes: %d\n", c.Username, c.Telephon, len(h.Clients))
			// Notificar a los contactos que este usuario está offline (en goroutine para no bloquear el hub)
			go h.NotifyContactsOffline(c.Telephon)

		case msg := <-h.Broadcast:
			h.mu.RLock()
			for _, c := range h.Clients {
				c.Send <- msg
			}
			h.mu.RUnlock()
		}
	}
}

// SendTo envía un mensaje privado a un usuario específico (chat 1 a 1) usando el telephon
func (h *Hub) SendTo(telephon string, msg []byte) {
	h.mu.RLock()
	client, exists := h.Clients[telephon]
	h.mu.RUnlock()

	if exists {
		select {
		case client.Send <- msg:
		default:
			// Canal lleno, ignorar
		}
	}
}

// GetClient obtiene un cliente de forma thread-safe usando el telephon
func (h *Hub) GetClient(telephon string) (*Client, bool) {
	h.mu.RLock()
	client, exists := h.Clients[telephon]
	h.mu.RUnlock()
	return client, exists
}

// UpdateClientUsername actualiza el username de un cliente conectado (solo para UI, la clave sigue siendo telephon)
func (h *Hub) UpdateClientUsername(oldUsername string, newUsername string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	// Buscar el cliente por username (iterar sobre todos)
	for telephon, client := range h.Clients {
		if client.Username == oldUsername {
			// Actualizar el username en el cliente (solo para mostrar)
			client.Username = newUsername
			fmt.Printf("[HUB] Username actualizado: %s -> %s (tel: %s)\n", oldUsername, newUsername, telephon)
			return
		}
	}
	fmt.Printf("[HUB] Cliente con username %s no encontrado\n", oldUsername)
}

// NotifyContactsOnline notifica a los contactos que un usuario está online (usa telephon)
func (h *Hub) NotifyContactsOnline(telephon string) {
	contacts := h.getUserContactsTelephons(telephon)
	fmt.Printf("[HUB] NotifyContactsOnline para tel: %s. Contactos encontrados: %v\n", telephon, contacts)

	if len(contacts) == 0 {
		fmt.Printf("[HUB] No hay contactos aceptados para notificar (tel: %s)\n", telephon)
		return
	}

	// Obtener el username para enviarlo en la notificación
	username, err := h.repo.GetUsernameByTelephon(telephon, context.Background())
	if err != nil {
		fmt.Printf("[HUB] Error obteniendo username para tel %s: %v\n", telephon, err)
		return
	}

	msg, _ := json.Marshal(map[string]interface{}{
		"type": "online",
		"payload": map[string]interface{}{
			"username": username,
			"telephon": telephon,
		},
	})

	for _, contactTelephon := range contacts {
		fmt.Printf("[HUB] Enviando notificación online de %s (tel: %s) a tel: %s\n", username, telephon, contactTelephon)
		h.SendTo(contactTelephon, msg)
	}
}

// NotifyContactsOffline notifica a los contactos que un usuario está offline (usa telephon)
func (h *Hub) NotifyContactsOffline(telephon string) {
	// Actualizar last_seen en la base de datos
	if err := h.repo.UpdateLastSeen(telephon, context.Background()); err != nil {
		fmt.Printf("[HUB] Error actualizando last_seen para tel %s: %v\n", telephon, err)
	}

	now := time.Now().UTC()
	contacts := h.getUserContactsTelephons(telephon)

	// Obtener el username para enviarlo en la notificación
	username, err := h.repo.GetUsernameByTelephon(telephon, context.Background())
	if err != nil {
		fmt.Printf("[HUB] Error obteniendo username para tel %s: %v\n", telephon, err)
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

	for _, contactTelephon := range contacts {
		h.SendTo(contactTelephon, msg)
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

	fmt.Printf("[HUB] GetOnlineContacts para tel: %s. Total contactos: %d, Online: %d (%v)\n", telephon, len(contactTelephons), len(onlineContacts), onlineContacts)
	return onlineContacts
}

// getUserContactsTelephons obtiene la lista BIDIRECCIONAL de telephons relacionados:
// personas que YO tengo agregadas + personas que ME tienen agregado a mí
func (h *Hub) getUserContactsTelephons(telephon string) []string {
	if h.repo == nil {
		return []string{}
	}

	id, err := h.repo.GetIdByTelephon(telephon, context.Background())
	if err != nil {
		return []string{}
	}

	// Dirección 1: personas que YO tengo agregadas
	contacts, err := h.repo.GetContactsTelephons(uint(id), context.Background())
	if err != nil {
		contacts = &[]models.ContactChat{}
	}

	// Dirección 2: personas que ME tienen agregado a mí
	reverse, err := h.repo.GetUsersWhoHaveMeAsContactTelephons(uint(id), context.Background())
	if err != nil {
		reverse = []string{}
	}

	// Unión sin duplicados
	seen := make(map[string]struct{})
	var result []string
	for _, c := range *contacts {
		if c.Status == "accepted" {
			if _, ok := seen[c.Number]; !ok {
				seen[c.Number] = struct{}{}
				result = append(result, c.Number)
			}
		}
	}
	for _, t := range reverse {
		if _, ok := seen[t]; !ok {
			seen[t] = struct{}{}
			result = append(result, t)
		}
	}
	return result
}

// NotifyContactRequest notifica a un usuario que recibió una solicitud de contacto
func (h *Hub) NotifyContactRequest(recipientUsername string, senderUsername string, senderNumber string) {
	// Convertir username a telephon para buscar el cliente
	recipientTelephon, err := h.repo.GetTelephonByUsername(recipientUsername, context.Background())
	if err != nil {
		fmt.Printf("[HUB] Error obteniendo teléfono de %s: %v\n", recipientUsername, err)
		return
	}

	h.mu.RLock()
	client, exists := h.Clients[recipientTelephon]
	h.mu.RUnlock()

	if !exists {
		fmt.Printf("[HUB] Usuario %s (tel: %s) no está conectado para recibir solicitud de contacto de %s\n", recipientUsername, recipientTelephon, senderUsername)
		return
	}

	msg, err := json.Marshal(map[string]interface{}{
		"type": "contact_request",
		"payload": map[string]interface{}{
			"username": senderUsername,
			"number":   senderNumber,
			"status":   "pending_received",
		},
	})
	if err != nil {
		fmt.Printf("[HUB] Error al serializar solicitud de contacto: %v\n", err)
		return
	}

	fmt.Printf("[HUB] Enviando solicitud de contacto de %s a %s (tel: %s)\n", senderUsername, recipientUsername, recipientTelephon)
	select {
	case client.Send <- msg:
		fmt.Printf("[HUB] Solicitud de contacto enviada exitosamente\n")
	default:
		fmt.Printf("[HUB] No se pudo enviar solicitud de contacto, canal lleno\n")
	}
}

// NotifyContactResponse notifica a un usuario sobre la respuesta a su solicitud de contacto
func (h *Hub) NotifyContactResponse(recipientUsername string, responderUsername string, responderNumber string, accepted bool) {
	// Convertir username a telephon
	recipientTelephon, err := h.repo.GetTelephonByUsername(recipientUsername, context.Background())
	if err != nil {
		fmt.Printf("[HUB] Error obteniendo teléfono de %s: %v\n", recipientUsername, err)
		return
	}

	h.mu.RLock()
	client, exists := h.Clients[recipientTelephon]
	h.mu.RUnlock()

	if !exists {
		fmt.Printf("[HUB] Usuario %s (tel: %s) no está conectado para recibir respuesta de contacto de %s\n", recipientUsername, recipientTelephon, responderUsername)
		return
	}

	status := "rejected"
	if accepted {
		status = "accepted"
	}

	msg, err := json.Marshal(map[string]interface{}{
		"type": "contact_response",
		"payload": map[string]interface{}{
			"username": responderUsername,
			"number":   responderNumber,
			"status":   status,
			"accepted": accepted,
		},
	})
	if err != nil {
		fmt.Printf("[HUB] Error al serializar respuesta de contacto: %v\n", err)
		return
	}

	fmt.Printf("[HUB] Enviando respuesta de contacto de %s a %s (tel: %s, accepted: %v)\n", responderUsername, recipientUsername, recipientTelephon, accepted)
	select {
	case client.Send <- msg:
		fmt.Printf("[HUB] Respuesta de contacto enviada exitosamente\n")
	default:
		fmt.Printf("[HUB] No se pudo enviar respuesta de contacto, canal lleno\n")
	}

	// Si fue aceptada, notificar a ambos usuarios el estado online del otro
	if accepted {
		go h.notifyOnlineAfterAccept(recipientTelephon, recipientUsername, responderNumber, responderUsername)
	}
}

// notifyOnlineAfterAccept notifica a ambos usuarios su estado online mutuo después de aceptar contacto
func (h *Hub) notifyOnlineAfterAccept(userATelephon, userAUsername, userBTelephon, userBUsername string) {
	fmt.Printf("[HUB] Notificando estado online mutuo entre %s (tel: %s) y %s (tel: %s)\n", userAUsername, userATelephon, userBUsername, userBTelephon)

	// Verificar si usuario B (quien respondió) está online
	_, bOnline := h.GetClient(userBTelephon)
	if bOnline {
		// Notificar a usuario A que B está online
		msgBOnline, _ := json.Marshal(map[string]interface{}{
			"type": "online",
			"payload": map[string]interface{}{
				"username": userBUsername,
				"telephon": userBTelephon,
			},
		})
		h.SendTo(userATelephon, msgBOnline)
		fmt.Printf("[HUB] Notificado a %s que %s está online\n", userAUsername, userBUsername)
	}

	// Verificar si usuario A (quien envió la solicitud) está online
	_, aOnline := h.GetClient(userATelephon)
	if aOnline {
		// Notificar a usuario B que A está online
		msgAOnline, _ := json.Marshal(map[string]interface{}{
			"type": "online",
			"payload": map[string]interface{}{
				"username": userAUsername,
				"telephon": userATelephon,
			},
		})
		h.SendTo(userBTelephon, msgAOnline)
		fmt.Printf("[HUB] Notificado a %s que %s está online\n", userBUsername, userAUsername)
	}
}

// NotifyUsernameChange notifica a los contactos de un usuario que cambió su username
func (h *Hub) NotifyUsernameChange(oldUsername string, newUsername string) {
	fmt.Printf("[HUB] === INICIO NotifyUsernameChange: %s -> %s ===\n", oldUsername, newUsername)

	// Obtener el telephon del usuario para actualizar el cliente
	telephon, err := h.repo.GetTelephonByUsername(newUsername, context.Background())
	if err != nil {
		fmt.Printf("[HUB] Error obteniendo teléfono para username %s: %v\n", newUsername, err)
		return
	}

	// Actualizar el username en el cliente si está conectado
	h.UpdateClientUsername(oldUsername, newUsername)

	// Verificar que el cambio se aplicó correctamente
	if client, exists := h.GetClient(telephon); exists {
		fmt.Printf("[HUB] ✓ Cliente CONFIRMADO con nuevo username: %s (tel: %s)\n", client.Username, telephon)
	} else {
		fmt.Printf("[HUB] ⚠ Cliente NO estaba conectado (tel: %s)\n", telephon)
	}

	// Obtener contactos del usuario (usando el telephon)
	contacts := h.getUserContactsTelephons(telephon)
	fmt.Printf("[HUB] Notificando cambio de username de %s a %s. Contactos: %v\n", oldUsername, newUsername, contacts)

	if len(contacts) == 0 {
		fmt.Printf("[HUB] No hay contactos para notificar el cambio de username\n")
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

	for _, contactTelephon := range contacts {
		fmt.Printf("[HUB] Enviando notificación de cambio de username a tel: %s\n", contactTelephon)
		h.SendTo(contactTelephon, msg)
	}

	// Notificar que el usuario sigue en línea con el nuevo nombre
	// Solo si el cliente está conectado
	if _, isOnline := h.GetClient(telephon); isOnline {
		onlineMsg, _ := json.Marshal(map[string]interface{}{
			"type": "online",
			"payload": map[string]interface{}{
				"username": newUsername,
				"telephon": telephon,
			},
		})

		for _, contactTelephon := range contacts {
			h.SendTo(contactTelephon, onlineMsg)
		}
		fmt.Printf("[HUB] Notificado estado online con nuevo username %s (tel: %s)\n", newUsername, telephon)
	}

	fmt.Printf("[HUB] === FIN NotifyUsernameChange ===\n")
}
