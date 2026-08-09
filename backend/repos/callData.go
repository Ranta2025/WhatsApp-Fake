package repos

import (
	"context"
	"gorm/backend/models"
	"time"

	"gorm.io/gorm"
)

// CreateCallLog guarda un nuevo registro de llamada
func (ap *ApiContact) CreateCallLog(callLog *models.CallLog, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	return ap.data.WithContext(c).Create(callLog).Error
}

// UpdateCallLog actualiza un registro de llamada existente (por RoomID)
func (ap *ApiContact) UpdateCallLogByRoomID(roomID string, updates map[string]interface{}, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	return ap.data.Model(&models.CallLog{}).WithContext(c).Where("room_id = ?", roomID).Updates(updates).Error
}

// GetCallLogsByUser obtiene el historial de llamadas de un usuario (como caller o receiver)
func (ap *ApiContact) GetCallLogsByUser(userID uint, ctx context.Context) ([]models.CallLog, error) {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	var calls []models.CallLog
	err := ap.data.WithContext(c).
		Where("(caller_id = ? AND deleted_by_caller = false) OR (receiver_id = ? AND deleted_by_receiver = false)", userID, userID).
		Order("created_at DESC").
		Limit(100).
		Find(&calls).Error
	return calls, err
}

// DeleteCallLogForUser marca una llamada como eliminada para un usuario específico
func (ap *ApiContact) DeleteCallLogForUser(callID uint, userID uint, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	// Determinar si el usuario es caller o receiver
	var callLog models.CallLog
	if err := ap.data.WithContext(c).First(&callLog, callID).Error; err != nil {
		return err
	}

	if callLog.CallerID == userID {
		return ap.data.Model(&models.CallLog{}).WithContext(c).Where("id = ?", callID).Update("deleted_by_caller", true).Error
	} else if callLog.ReceiverID == userID {
		return ap.data.Model(&models.CallLog{}).WithContext(c).Where("id = ?", callID).Update("deleted_by_receiver", true).Error
	}

	return gorm.ErrRecordNotFound
}
