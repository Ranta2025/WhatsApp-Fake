package services

import (
	"context"
	"errors"
	"gorm/backend/models"
	"gorm/backend/schemas"
	"log"
	"math"
	"time"
)

type CallServicer interface {
	CreateCallLog(callerTelephon, receiverTelephon, roomID, callType string, ctx context.Context) error
	MarkCallAnswered(roomID string, telephon string, ctx context.Context) error
	MarkCallRejected(roomID string, telephon string, ctx context.Context) error
	MarkCallUnavailable(roomID string, telephon string, ctx context.Context) error
	MarkCallEnded(roomID string, telephon string, ctx context.Context) error
	GetCallHistory(telephon string, ctx context.Context) ([]schemas.CallLogResponse, error)
	DeleteCallForUser(callID uint, telephon string, ctx context.Context) error
}

type CallRepoInterface interface {
	GetIdByTelephon(telephon string, ctx context.Context) (int, error)
	CreateCallLog(call *models.CallLog, ctx context.Context) error
	GetTelephonByID(id uint, ctx context.Context) (string, error)
	UpdateCallLogByRoomID(roomID string, userID uint, data map[string]interface{}, ctx context.Context) error
	GetCallLogsByUser(userID uint, ctx context.Context) ([]models.CallLog, error)
	GetUsersBasicByIDs(ids []uint, ctx context.Context) (map[uint]models.UserBasic, error)
	DeleteCallLogForUser(callID uint, userID uint, ctx context.Context) error
}

type ServiceCall struct {
	repo CallRepoInterface
}

func InitServiceCall(repo CallRepoInterface) CallServicer {
	return &ServiceCall{repo: repo}
}

// CreateCallLog crea un registro de llamada cuando se inicia una llamada
func (s *ServiceCall) CreateCallLog(callerTelephon, receiverTelephon, roomID, callType string, ctx context.Context) error {
	if callType != "video" && callType != "audio" {
		return errors.New("tipo de llamada no válido")
	}
	if roomID == "" || len(roomID) > 100 {
		return errors.New("roomID no válido")
	}

	callerID, err := s.repo.GetIdByTelephon(callerTelephon, ctx)
	if err != nil {
		log.Printf("[CALL-SERVICE] Error obteniendo ID del caller %s: %v", callerTelephon, err)
		return err
	}

	receiverID, err := s.repo.GetIdByTelephon(receiverTelephon, ctx)
	if err != nil {
		log.Printf("[CALL-SERVICE] Error obteniendo ID del receiver %s: %v", receiverTelephon, err)
		return err
	}
	if callerID == receiverID {
		return errors.New("no puedes llamarte a ti mismo")
	}

	callLog := &models.CallLog{
		CallerID:   uint(callerID),
		ReceiverID: uint(receiverID),
		RoomID:     roomID,
		CallType:   callType,
		Status:     "missed", // Por defecto es perdida hasta que se conteste
		StartedAt:  time.Now(),
	}

	if err := s.repo.CreateCallLog(callLog, ctx); err != nil {
		log.Printf("[CALL-SERVICE] Error creando call log: %v", err)
		return err
	}
	return nil
}

// updateCall aplica cambios al registro de la llamada verificando que el
// usuario (por teléfono) participe en ella.
func (s *ServiceCall) updateCall(roomID, telephon string, updates map[string]interface{}, ctx context.Context) error {
	userID, err := s.repo.GetIdByTelephon(telephon, ctx)
	if err != nil {
		return err
	}
	return s.repo.UpdateCallLogByRoomID(roomID, uint(userID), updates, ctx)
}

// MarkCallAnswered marca una llamada como contestada
func (s *ServiceCall) MarkCallAnswered(roomID string, telephon string, ctx context.Context) error {
	return s.updateCall(roomID, telephon, map[string]interface{}{
		"status":      "answered",
		"answered_at": time.Now(),
	}, ctx)
}

// MarkCallRejected marca una llamada como rechazada
func (s *ServiceCall) MarkCallRejected(roomID string, telephon string, ctx context.Context) error {
	return s.updateCall(roomID, telephon, map[string]interface{}{
		"status":   "rejected",
		"ended_at": time.Now(),
	}, ctx)
}

// MarkCallUnavailable marca una llamada como no disponible
func (s *ServiceCall) MarkCallUnavailable(roomID string, telephon string, ctx context.Context) error {
	return s.updateCall(roomID, telephon, map[string]interface{}{
		"status":   "unavailable",
		"ended_at": time.Now(),
	}, ctx)
}

// MarkCallEnded marca una llamada como finalizada (la duración se calcula al leer el historial)
func (s *ServiceCall) MarkCallEnded(roomID string, telephon string, ctx context.Context) error {
	return s.updateCall(roomID, telephon, map[string]interface{}{
		"ended_at": time.Now(),
	}, ctx)
}

// GetCallHistory obtiene el historial de llamadas de un usuario
func (s *ServiceCall) GetCallHistory(telephon string, ctx context.Context) ([]schemas.CallLogResponse, error) {
	userID, err := s.repo.GetIdByTelephon(telephon, ctx)
	if err != nil {
		return nil, err
	}

	calls, err := s.repo.GetCallLogsByUser(uint(userID), ctx)
	if err != nil {
		return nil, err
	}

	// Resolver todos los participantes en una sola consulta (antes: 2 por llamada)
	idSet := make(map[uint]struct{}, len(calls)*2)
	ids := make([]uint, 0, len(calls)*2)
	for _, call := range calls {
		for _, id := range []uint{call.CallerID, call.ReceiverID} {
			if _, ok := idSet[id]; !ok {
				idSet[id] = struct{}{}
				ids = append(ids, id)
			}
		}
	}
	users, err := s.repo.GetUsersBasicByIDs(ids, ctx)
	if err != nil {
		return nil, err
	}

	result := make([]schemas.CallLogResponse, 0, len(calls))
	for _, call := range calls {
		caller := users[call.CallerID]
		receiver := users[call.ReceiverID]

		// Calcular duración si la llamada fue contestada y terminó
		duration := call.Duration
		if call.AnsweredAt != nil && call.EndedAt != nil {
			duration = int(math.Round(call.EndedAt.Sub(*call.AnsweredAt).Seconds()))
		}

		result = append(result, schemas.CallLogResponse{
			ID:               call.ID,
			CallerTelephon:   caller.Telephon,
			CallerUsername:   caller.Username,
			ReceiverTelephon: receiver.Telephon,
			ReceiverUsername: receiver.Username,
			CallType:         call.CallType,
			Status:           call.Status,
			StartedAt:        call.StartedAt,
			AnsweredAt:       call.AnsweredAt,
			EndedAt:          call.EndedAt,
			Duration:         duration,
			IsOutgoing:       call.CallerID == uint(userID),
		})
	}

	return result, nil
}

// DeleteCallForUser elimina un registro de llamada para un usuario
func (s *ServiceCall) DeleteCallForUser(callID uint, telephon string, ctx context.Context) error {
	userID, err := s.repo.GetIdByTelephon(telephon, ctx)
	if err != nil {
		return err
	}
	return s.repo.DeleteCallLogForUser(callID, uint(userID), ctx)
}
