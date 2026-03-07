package services

import (
	"context"
	"gorm/backend/models"
	"gorm/backend/schemas"
	"log"
	"math"
	"time"
)

type CallServicer interface {
	CreateCallLog(callerTelephon, receiverTelephon, roomID, callType string, ctx context.Context) error
	// CreateGroupCallLogs registra una entrada de llamada por cada miembro del grupo.
	CreateGroupCallLogs(callerTelephon string, memberTelephons []string, groupID uint, groupName string, roomID string, callType string, ctx context.Context) error
	MarkCallAnswered(roomID string, ctx context.Context) error
	MarkCallRejected(roomID string, ctx context.Context) error
	MarkCallUnavailable(roomID string, ctx context.Context) error
	MarkCallEnded(roomID string, ctx context.Context) error
	GetCallHistory(telephon string, ctx context.Context) ([]schemas.CallLogResponse, error)
	DeleteCallForUser(callID uint, telephon string, ctx context.Context) error
}

type CallRepoInterface interface {
	GetIdByTelephon(telephon string, ctx context.Context) (int, error)
	CreateCallLog(call *models.CallLog, ctx context.Context) error
	GetTelephonByID(id uint, ctx context.Context) (string, error)
	UpdateCallLogByRoomID(roomID string, data map[string]interface{}, ctx context.Context) error
	GetCallLogsByUser(userID uint, ctx context.Context) ([]models.CallLog, error)
	GetUserByID(userID uint, ctx context.Context) (*models.UserDataBase, error)
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

	log.Printf("[CALL-SERVICE] Llamada registrada: %s -> %s (sala: %s)", callerTelephon, receiverTelephon, roomID)
	return nil
}

// CreateGroupCallLogs crea un CallLog por cada miembro del grupo (exceptuando al caller).
func (s *ServiceCall) CreateGroupCallLogs(callerTelephon string, memberTelephons []string, groupID uint, groupName string, roomID string, callType string, ctx context.Context) error {
	callerID, err := s.repo.GetIdByTelephon(callerTelephon, ctx)
	if err != nil {
		log.Printf("[CALL-SERVICE] Error obteniendo ID del caller en llamada grupal: %v", err)
		return err
	}

	gid := groupID
	for _, memberTel := range memberTelephons {
		if memberTel == callerTelephon {
			continue
		}
		memberID, err := s.repo.GetIdByTelephon(memberTel, ctx)
		if err != nil {
			log.Printf("[CALL-SERVICE] Miembro %s no encontrado, omitiendo: %v", memberTel, err)
			continue
		}
		callLog := &models.CallLog{
			CallerID:   uint(callerID),
			ReceiverID: uint(memberID),
			RoomID:     roomID,
			CallType:   callType,
			Status:     "missed",
			StartedAt:  time.Now(),
			GroupID:    &gid,
			GroupName:  groupName,
		}
		if err := s.repo.CreateCallLog(callLog, ctx); err != nil {
			log.Printf("[CALL-SERVICE] Error creando log para miembro %s: %v", memberTel, err)
		}
	}

	log.Printf("[CALL-SERVICE] Llamada grupal registrada: %s -> grupo %d (sala: %s)", callerTelephon, groupID, roomID)
	return nil
}

// MarkCallAnswered marca una llamada como contestada
func (s *ServiceCall) MarkCallAnswered(roomID string, ctx context.Context) error {
	now := time.Now()
	return s.repo.UpdateCallLogByRoomID(roomID, map[string]interface{}{
		"status":      "answered",
		"answered_at": now,
	}, ctx)
}

// MarkCallRejected marca una llamada como rechazada
func (s *ServiceCall) MarkCallRejected(roomID string, ctx context.Context) error {
	now := time.Now()
	return s.repo.UpdateCallLogByRoomID(roomID, map[string]interface{}{
		"status":   "rejected",
		"ended_at": now,
	}, ctx)
}

// MarkCallUnavailable marca una llamada como no disponible
func (s *ServiceCall) MarkCallUnavailable(roomID string, ctx context.Context) error {
	now := time.Now()
	return s.repo.UpdateCallLogByRoomID(roomID, map[string]interface{}{
		"status":   "unavailable",
		"ended_at": now,
	}, ctx)
}

// MarkCallEnded marca una llamada como finalizada y calcula la duración
func (s *ServiceCall) MarkCallEnded(roomID string, ctx context.Context) error {
	now := time.Now()
	return s.repo.UpdateCallLogByRoomID(roomID, map[string]interface{}{
		"ended_at": now,
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

	var result []schemas.CallLogResponse
	for _, call := range calls {
		// Obtener datos de caller y receiver
		callerData, _ := s.repo.GetUserByID(call.CallerID, ctx)
		receiverData, _ := s.repo.GetUserByID(call.ReceiverID, ctx)

		callerTel := ""
		callerUser := ""
		receiverTel := ""
		receiverUser := ""

		if callerData != nil {
			callerTel = callerData.Telephon
			callerUser = callerData.Username
		}
		if receiverData != nil {
			receiverTel = receiverData.Telephon
			receiverUser = receiverData.Username
		}

		// Calcular duración si la llamada fue contestada y terminó
		duration := call.Duration
		if call.AnsweredAt != nil && call.EndedAt != nil {
			duration = int(math.Round(call.EndedAt.Sub(*call.AnsweredAt).Seconds()))
		}

		result = append(result, schemas.CallLogResponse{
			ID:               call.ID,
			CallerTelephon:   callerTel,
			CallerUsername:   callerUser,
			ReceiverTelephon: receiverTel,
			ReceiverUsername: receiverUser,
			CallType:         call.CallType,
			Status:           call.Status,
			StartedAt:        call.StartedAt,
			AnsweredAt:       call.AnsweredAt,
			EndedAt:          call.EndedAt,
			Duration:         duration,
			IsOutgoing:       call.CallerID == uint(userID),
			IsGroupCall:      call.GroupID != nil,
			GroupID:          call.GroupID,
			GroupName:        call.GroupName,
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
