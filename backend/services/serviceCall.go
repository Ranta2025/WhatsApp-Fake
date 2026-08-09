package services

import (
	"context"
	"fmt"
	"gorm/backend/models"
	"gorm/backend/schemas"
	"log"
	"math"
	"time"
)

type CallServicer interface {
	CreateCallLog(callerTelephon, receiverTelephon, roomID, callType string, ctx context.Context) error
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
	GetUserByIDs(ids []uint, ctx context.Context) (map[uint]*models.UserDataBase, error)
	DeleteCallLogForUser(callID uint, userID uint, ctx context.Context) error
}

type ServiceCall struct {
	repo CallRepoInterface
}

func InitServiceCall(repo CallRepoInterface) CallServicer {
	return &ServiceCall{repo: repo}
}

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
		Status:     "missed",
		StartedAt:  time.Now(),
	}

	if err := s.repo.CreateCallLog(callLog, ctx); err != nil {
		log.Printf("[CALL-SERVICE] Error creando call log: %v", err)
		return err
	}

	log.Printf("[CALL-SERVICE] Llamada registrada: %s -> %s (sala: %s)", callerTelephon, receiverTelephon, roomID)
	return nil
}

func (s *ServiceCall) CreateGroupCallLogs(callerTelephon string, memberTelephons []string, groupID uint, groupName string, roomID string, callType string, ctx context.Context) error {
	callerID, err := s.repo.GetIdByTelephon(callerTelephon, ctx)
	if err != nil {
		return fmt.Errorf("error obteniendo ID del caller en llamada grupal: %w", err)
	}

	gid := groupID
	var errs []error
	for _, memberTel := range memberTelephons {
		if memberTel == callerTelephon {
			continue
		}
		memberID, err := s.repo.GetIdByTelephon(memberTel, ctx)
		if err != nil {
			log.Printf("[CALL-SERVICE] Miembro %s no encontrado, omitiendo: %v", memberTel, err)
			errs = append(errs, fmt.Errorf("miembro %s: %w", memberTel, err))
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
			errs = append(errs, fmt.Errorf("log miembro %s: %w", memberTel, err))
		}
	}

	if len(errs) > 0 {
		return fmt.Errorf("errores creando logs de llamada grupal: %v", errs)
	}

	log.Printf("[CALL-SERVICE] Llamada grupal registrada: %s -> grupo %d (sala: %s)", callerTelephon, groupID, roomID)
	return nil
}

func (s *ServiceCall) MarkCallAnswered(roomID string, ctx context.Context) error {
	now := time.Now()
	return s.repo.UpdateCallLogByRoomID(roomID, map[string]interface{}{
		"status":      "answered",
		"answered_at": now,
	}, ctx)
}

func (s *ServiceCall) MarkCallRejected(roomID string, ctx context.Context) error {
	now := time.Now()
	return s.repo.UpdateCallLogByRoomID(roomID, map[string]interface{}{
		"status":   "rejected",
		"ended_at": now,
	}, ctx)
}

func (s *ServiceCall) MarkCallUnavailable(roomID string, ctx context.Context) error {
	now := time.Now()
	return s.repo.UpdateCallLogByRoomID(roomID, map[string]interface{}{
		"status":   "unavailable",
		"ended_at": now,
	}, ctx)
}

func (s *ServiceCall) MarkCallEnded(roomID string, ctx context.Context) error {
	now := time.Now()
	return s.repo.UpdateCallLogByRoomID(roomID, map[string]interface{}{
		"ended_at": now,
	}, ctx)
}

func (s *ServiceCall) GetCallHistory(telephon string, ctx context.Context) ([]schemas.CallLogResponse, error) {
	userID, err := s.repo.GetIdByTelephon(telephon, ctx)
	if err != nil {
		return nil, err
	}

	calls, err := s.repo.GetCallLogsByUser(uint(userID), ctx)
	if err != nil {
		return nil, err
	}

	uniqueIDs := make(map[uint]struct{})
	for _, call := range calls {
		uniqueIDs[call.CallerID] = struct{}{}
		uniqueIDs[call.ReceiverID] = struct{}{}
	}
	idList := make([]uint, 0, len(uniqueIDs))
	for id := range uniqueIDs {
		idList = append(idList, id)
	}

	usersMap, err := s.repo.GetUserByIDs(idList, ctx)
	if err != nil {
		return nil, fmt.Errorf("error obteniendo usuarios en batch: %w", err)
	}

	var result []schemas.CallLogResponse
	for _, call := range calls {
		callerTel := ""
		callerUser := ""
		receiverTel := ""
		receiverUser := ""

		if callerData, ok := usersMap[call.CallerID]; ok {
			callerTel = callerData.Telephon
			callerUser = callerData.Username
		}
		if receiverData, ok := usersMap[call.ReceiverID]; ok {
			receiverTel = receiverData.Telephon
			receiverUser = receiverData.Username
		}

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

func (s *ServiceCall) DeleteCallForUser(callID uint, telephon string, ctx context.Context) error {
	userID, err := s.repo.GetIdByTelephon(telephon, ctx)
	if err != nil {
		return err
	}
	return s.repo.DeleteCallLogForUser(callID, uint(userID), ctx)
}
