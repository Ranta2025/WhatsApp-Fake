package services

import (
	"context"
	"encoding/json"
	"gorm/backend/models"
	"gorm/backend/repos"
	ws "gorm/backend/websocket"
	"log"
	"time"
)

type ServiceWebSocket struct {
	repo        *repos.ApiContact
	Hub         *ws.Hub
	chatService *ServiceChat
}

func InitServiceWebSocket(repo *repos.ApiContact, chatService *ServiceChat) *ServiceWebSocket {
	hub := ws.NewHub()

	service := &ServiceWebSocket{
		repo:        repo,
		Hub:         hub,
		chatService: chatService,
	}

	// Configurar callbacks del hub
	hub.MessageHandler = service.HandleMessage
	hub.OnConnect = service.HandleConnect
	hub.OnDisconnect = service.HandleDisconnect

	// Iniciar hub en goroutine
	go hub.Run()

	return service
}

// HandleMessage procesa mensajes recibidos del cliente
func (s *ServiceWebSocket) HandleMessage(client *ws.Client, message []byte) {
	var wsMsg models.WSMessage
	if err := json.Unmarshal(message, &wsMsg); err != nil {
		log.Printf("Error parseando mensaje: %v", err)
		return
	}

	// Establecer timestamp
	wsMsg.Timestamp = time.Now()
	wsMsg.From = client.Username

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	switch wsMsg.Type {
	case "ping":
		// Heartbeat del cliente - ignorar, el servidor ya maneja pong automáticamente
		return
	case models.MessageTypeChat:
		s.handleChatMessage(client, &wsMsg, ctx)
	case models.MessageTypeRead:
		s.handleReadMessage(client, &wsMsg, ctx)
	case models.MessageTypeTyping:
		s.handleTyping(client, &wsMsg)
	case models.MessageTypeContactAccept:
		s.handleContactAccept(client, &wsMsg, ctx)
	case models.MessageTypeContactReject:
		s.handleContactReject(client, &wsMsg, ctx)
	default:
		log.Printf("Tipo de mensaje desconocido: %s", wsMsg.Type)
	}
}

// handleChatMessage maneja mensajes de chat
func (s *ServiceWebSocket) handleChatMessage(client *ws.Client, wsMsg *models.WSMessage, ctx context.Context) {
	// 1. Guardar mensaje en DB como "enviado"
	messageCreat := models.MessageCreat{
		Username: client.Username,
		MessageGet: models.MessageGet{
			Receptor: wsMsg.To,
			Message:  wsMsg.Message,
		},
	}

	savedMsg, err := s.chatService.ServiceCreatMessage(messageCreat, ctx)
	if err != nil {
		log.Printf("Error guardando mensaje: %v", err)
		client.SendJSON(models.WSResponse{
			Type:    "error",
			Success: false,
			Message: "Error al enviar mensaje",
		})
		return
	}

	// 2. Verificar si el receptor está conectado
	if recipientClient, ok := s.Hub.GetClient(wsMsg.To); ok {
		// Receptor está online -> marcar como "entregado"
		idFrom, _ := s.repo.GetIdUsername(client.Username, ctx)
		idTo, _ := s.repo.GetIdUsername(wsMsg.To, ctx)
		if err := s.repo.PutStatusMessageDeliveredByContact(uint(idFrom), uint(idTo), ctx); err != nil {
			log.Printf("Error actualizando a entregado: %v", err)
		}

		// Enviar mensaje al receptor con estado "entregado"
		wsMsg.MessageID = savedMsg.MessageID
		wsMsg.Status = models.StatusDelivered
		recipientClient.SendJSON(wsMsg)

		// Notificar al remitente que se entregó
		deliveredNotif := models.WSMessage{
			Type:      models.MessageTypeDelivered,
			From:      client.Username,
			To:        wsMsg.To,
			MessageID: savedMsg.MessageID,
			Status:    models.StatusDelivered,
			Timestamp: time.Now(),
		}
		client.SendJSON(deliveredNotif)
	} else {
		// Si no está conectado, queda como "enviado"
		wsMsg.MessageID = savedMsg.MessageID
		wsMsg.Status = models.StatusSent
		client.SendJSON(wsMsg)
	}
}

// handleReadMessage maneja confirmaciones de lectura
func (s *ServiceWebSocket) handleReadMessage(client *ws.Client, wsMsg *models.WSMessage, ctx context.Context) {
	// Actualizar todos los mensajes del remitente (wsMsg.From) al receptor (client.Username) a "visto"
	idSender, err := s.repo.GetIdUsername(wsMsg.From, ctx)
	if err != nil {
		log.Printf("Error obteniendo ID del remitente: %v", err)
		return
	}
	idReceptor, err := s.repo.GetIdUsername(client.Username, ctx)
	if err != nil {
		log.Printf("Error obteniendo ID del receptor: %v", err)
		return
	}

	// Actualizar mensajes de "entregado" a "visto"
	if err := s.repo.PutStatusMessageSeenByContact(uint(idSender), uint(idReceptor), ctx); err != nil {
		log.Printf("Error marcando mensajes como vistos: %v", err)
		return
	}

	// Notificar al remitente original que sus mensajes fueron vistos
	if senderClient, ok := s.Hub.GetClient(wsMsg.From); ok {
		readNotif := models.WSMessage{
			Type:      models.MessageTypeRead,
			From:      client.Username,
			To:        wsMsg.From,
			Status:    models.StatusRead,
			Timestamp: time.Now(),
		}
		senderClient.SendJSON(readNotif)
	}
}

// handleTyping maneja indicador de "escribiendo..."
func (s *ServiceWebSocket) handleTyping(client *ws.Client, wsMsg *models.WSMessage) {
	// Simplemente reenviar al destinatario si está conectado
	if recipientClient, ok := s.Hub.GetClient(wsMsg.To); ok {
		recipientClient.SendJSON(wsMsg)
	}
}

// HandleConnect se ejecuta cuando un usuario se conecta
func (s *ServiceWebSocket) HandleConnect(username string, client *ws.Client) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// 1. Obtener contactos del usuario
	contacts, err := s.getContactsUsernames(username, ctx)
	if err != nil {
		log.Printf("Error obteniendo contactos de %s: %v", username, err)
		return
	}

	// 2. Enviar lista de contactos online al usuario que se conectó
	contactStatuses := s.getContactsStatus(contacts)
	client.SendJSON(models.WSContactList{
		Type:     models.MessageTypeContactList,
		Contacts: contactStatuses,
	})

	// 3. Notificar a sus contactos que este usuario se conectó
	onlineNotif := models.WSMessage{
		Type:      models.MessageTypeOnline,
		From:      username,
		Timestamp: time.Now(),
	}
	s.notifyContacts(username, contacts, onlineNotif)

	// 4. Marcar mensajes pendientes como "entregado"
	if err := s.chatService.ServicePutAllMessageStatusDelivered(username, ctx); err != nil {
		log.Printf("Error marcando mensajes como entregados: %v", err)
	}
}

// HandleDisconnect se ejecuta cuando un usuario se desconecta
func (s *ServiceWebSocket) HandleDisconnect(username string) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Obtener contactos y notificarles que se desconectó
	contacts, err := s.getContactsUsernames(username, ctx)
	if err != nil {
		log.Printf("Error obteniendo contactos de %s: %v", username, err)
		return
	}

	offlineNotif := models.WSMessage{
		Type:      models.MessageTypeOffline,
		From:      username,
		Timestamp: time.Now(),
	}
	s.notifyContacts(username, contacts, offlineNotif)
}

// getContactsUsernames obtiene lista de usernames de contactos
func (s *ServiceWebSocket) getContactsUsernames(username string, ctx context.Context) ([]string, error) {
	idUser, err := s.repo.GetIdUsername(username, ctx)
	if err != nil {
		return nil, err
	}

	contacts, err := s.repo.GetContactsNumber(uint(idUser), ctx)
	if err != nil {
		return nil, err
	}

	if contacts == nil {
		return []string{}, nil
	}

	usernames := make([]string, 0, len(*contacts))
	for _, contact := range *contacts {
		usernames = append(usernames, contact.Username)
	}
	return usernames, nil
}

// getContactsStatus obtiene el estado online/offline de contactos
func (s *ServiceWebSocket) getContactsStatus(usernames []string) []models.WSContactStatus {
	statuses := make([]models.WSContactStatus, 0, len(usernames))
	for _, username := range usernames {
		statuses = append(statuses, models.WSContactStatus{
			Username: username,
			Online:   s.Hub.IsOnline(username),
		})
	}
	return statuses
}

// notifyContacts envía notificación a todos los contactos conectados
func (s *ServiceWebSocket) notifyContacts(username string, contacts []string, message models.WSMessage) {
	data, err := json.Marshal(message)
	if err != nil {
		log.Printf("Error serializando notificación: %v", err)
		return
	}

	for _, contactUsername := range contacts {
		if s.Hub.IsOnline(contactUsername) {
			s.Hub.SendToUser(contactUsername, data)
		}
	}
}

// updateMessageStatus actualiza el estado de mensajes en DB
func (s *ServiceWebSocket) updateMessageStatus(from, to, status string, ctx context.Context) error {
	idFrom, err := s.repo.GetIdUsername(from, ctx)
	if err != nil {
		return err
	}
	idTo, err := s.repo.GetIdUsername(to, ctx)
	if err != nil {
		return err
	}

	if status == models.StatusDelivered {
		return s.repo.PutStatusMessageDeliveredByContact(uint(idFrom), uint(idTo), ctx)
	} else if status == models.StatusRead {
		return s.repo.PutStatusMessageSeenByContact(uint(idFrom), uint(idTo), ctx)
	}
	return nil
}

// handleContactAccept maneja cuando un usuario acepta una solicitud de contacto
func (s *ServiceWebSocket) handleContactAccept(client *ws.Client, wsMsg *models.WSMessage, ctx context.Context) {
	// Obtener IDs
	idUser, err := s.repo.GetIdUsername(client.Username, ctx)
	if err != nil {
		log.Printf("Error obteniendo ID de %s: %v", client.Username, err)
		client.SendJSON(models.WSResponse{
			Type:    "error",
			Success: false,
			Message: "Error al aceptar contacto",
		})
		return
	}

	idContact, err := s.repo.GetIdUsername(wsMsg.From, ctx)
	if err != nil {
		log.Printf("Error obteniendo ID de %s: %v", wsMsg.From, err)
		client.SendJSON(models.WSResponse{
			Type:    "error",
			Success: false,
			Message: "Contacto no encontrado",
		})
		return
	}

	// Verificar que el usuario sea el receptor (tiene status "pending_received")
	status, err := s.repo.GetContactStatus(uint(idUser), uint(idContact), ctx)
	if err != nil {
		log.Printf("Error obteniendo status del contacto: %v", err)
		client.SendJSON(models.WSResponse{
			Type:    "error",
			Success: false,
			Message: "Contacto no encontrado",
		})
		return
	}

	if status != "pending_received" {
		log.Printf("Usuario %s no puede aceptar solicitud de %s (status: %s)", client.Username, wsMsg.From, status)
		client.SendJSON(models.WSResponse{
			Type:    "error",
			Success: false,
			Message: "No tienes permiso para aceptar esta solicitud",
		})
		return
	}

	// Actualizar estado a "accepted" para AMBOS
	tx := s.repo.BeginTx()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	// Actualizar el que acepta (client.Username acepta a wsMsg.From)
	if err := s.repo.PutStatusTx(tx, uint(idUser), uint(idContact), "accepted", ctx); err != nil {
		tx.Rollback()
		log.Printf("Error actualizando estado: %v", err)
		client.SendJSON(models.WSResponse{
			Type:    "error",
			Success: false,
			Message: "Error al aceptar contacto",
		})
		return
	}

	// Actualizar el que envió la solicitud (wsMsg.From también pasa a accepted)
	if err := s.repo.PutStatusTx(tx, uint(idContact), uint(idUser), "accepted", ctx); err != nil {
		tx.Rollback()
		log.Printf("Error actualizando estado: %v", err)
		client.SendJSON(models.WSResponse{
			Type:    "error",
			Success: false,
			Message: "Error al aceptar contacto",
		})
		return
	}

	if err := tx.Commit().Error; err != nil {
		log.Printf("Error en commit: %v", err)
		client.SendJSON(models.WSResponse{
			Type:    "error",
			Success: false,
			Message: "Error al completar operación",
		})
		return
	}

	// Confirmar al que aceptó
	client.SendJSON(models.WSContactEvent{
		Type:      models.MessageTypeContactAccept,
		From:      wsMsg.From,
		To:        client.Username,
		Username:  wsMsg.From,
		Status:    "accepted",
		Timestamp: time.Now(),
	})

	// Notificar al otro usuario si está online
	if otherClient, ok := s.Hub.GetClient(wsMsg.From); ok {
		otherClient.SendJSON(models.WSContactEvent{
			Type:      models.MessageTypeContactAccept,
			From:      client.Username,
			To:        wsMsg.From,
			Username:  client.Username,
			Status:    "accepted",
			Timestamp: time.Now(),
		})
	}
}

// handleContactReject maneja cuando un usuario rechaza una solicitud de contacto
func (s *ServiceWebSocket) handleContactReject(client *ws.Client, wsMsg *models.WSMessage, ctx context.Context) {
	// Obtener IDs
	idUser, err := s.repo.GetIdUsername(client.Username, ctx)
	if err != nil {
		log.Printf("Error obteniendo ID de %s: %v", client.Username, err)
		return
	}

	idContact, err := s.repo.GetIdUsername(wsMsg.From, ctx)
	if err != nil {
		log.Printf("Error obteniendo ID de %s: %v", wsMsg.From, err)
		return
	}

	// Verificar que el usuario sea el receptor (tiene status "pending_received")
	status, err := s.repo.GetContactStatus(uint(idUser), uint(idContact), ctx)
	if err != nil {
		log.Printf("Error obteniendo status del contacto: %v", err)
		client.SendJSON(models.WSResponse{
			Type:    "error",
			Success: false,
			Message: "Contacto no encontrado",
		})
		return
	}

	if status != "pending_received" {
		log.Printf("Usuario %s no puede rechazar solicitud de %s (status: %s)", client.Username, wsMsg.From, status)
		client.SendJSON(models.WSResponse{
			Type:    "error",
			Success: false,
			Message: "No tienes permiso para rechazar esta solicitud",
		})
		return
	}

	// Actualizar estado a "rejected" para AMBOS
	tx := s.repo.BeginTx()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	if err := s.repo.PutStatusTx(tx, uint(idUser), uint(idContact), "rejected", ctx); err != nil {
		tx.Rollback()
		log.Printf("Error actualizando estado: %v", err)
		return
	}

	if err := s.repo.PutStatusTx(tx, uint(idContact), uint(idUser), "rejected", ctx); err != nil {
		tx.Rollback()
		log.Printf("Error actualizando estado: %v", err)
		return
	}

	if err := tx.Commit().Error; err != nil {
		log.Printf("Error en commit: %v", err)
		return
	}

	// Confirmar al que rechazó
	client.SendJSON(models.WSContactEvent{
		Type:      models.MessageTypeContactReject,
		From:      wsMsg.From,
		To:        client.Username,
		Username:  wsMsg.From,
		Status:    "rejected",
		Timestamp: time.Now(),
	})

	// Notificar al otro usuario si está online
	if otherClient, ok := s.Hub.GetClient(wsMsg.From); ok {
		otherClient.SendJSON(models.WSContactEvent{
			Type:      models.MessageTypeContactReject,
			From:      client.Username,
			To:        wsMsg.From,
			Username:  client.Username,
			Status:    "rejected",
			Timestamp: time.Now(),
		})
	}
}

// NotifyContactRequest notifica a un usuario sobre una nueva solicitud de contacto
func (s *ServiceWebSocket) NotifyContactRequest(fromUsername, toUsername, number string) {
	if client, ok := s.Hub.GetClient(toUsername); ok {
		client.SendJSON(models.WSContactEvent{
			Type:      models.MessageTypeContactRequest,
			From:      fromUsername,
			To:        toUsername,
			Username:  fromUsername,
			Number:    number,
			Status:    "pending_received",
			Timestamp: time.Now(),
		})
	}
}

// NotifyContactAccepted notifica a ambos usuarios que la solicitud fue aceptada
func (s *ServiceWebSocket) NotifyContactAccepted(accepterUsername, requesterUsername string) {
	acceptedEvent := models.WSContactEvent{
		Type:      models.MessageTypeContactAccept,
		Status:    "accepted",
		Timestamp: time.Now(),
	}

	// Notificar al que aceptó
	if client, ok := s.Hub.GetClient(accepterUsername); ok {
		event := acceptedEvent
		event.From = requesterUsername
		event.To = accepterUsername
		event.Username = requesterUsername
		client.SendJSON(event)
	}

	// Notificar al que envió la solicitud
	if client, ok := s.Hub.GetClient(requesterUsername); ok {
		event := acceptedEvent
		event.From = accepterUsername
		event.To = requesterUsername
		event.Username = accepterUsername
		client.SendJSON(event)
	}
}

// NotifyContactRejected notifica a ambos usuarios que la solicitud fue rechazada
func (s *ServiceWebSocket) NotifyContactRejected(rejecterUsername, requesterUsername string) {
	rejectedEvent := models.WSContactEvent{
		Type:      models.MessageTypeContactReject,
		Status:    "rejected",
		Timestamp: time.Now(),
	}

	// Notificar al que rechazó
	if client, ok := s.Hub.GetClient(rejecterUsername); ok {
		event := rejectedEvent
		event.From = requesterUsername
		event.To = rejecterUsername
		event.Username = requesterUsername
		client.SendJSON(event)
	}

	// Notificar al que envió la solicitud
	if client, ok := s.Hub.GetClient(requesterUsername); ok {
		event := rejectedEvent
		event.From = rejecterUsername
		event.To = requesterUsername
		event.Username = rejecterUsername
		client.SendJSON(event)
	}
}
