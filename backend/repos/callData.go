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

// UpdateCallLogByRoomID actualiza el registro de llamada de la sala indicada,
// solo si userID participa en ella (caller o receiver). Así un usuario no puede
// alterar el estado de llamadas ajenas conociendo el roomID.
func (ap *ApiContact) UpdateCallLogByRoomID(roomID string, userID uint, updates map[string]interface{}, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	result := ap.data.Model(&models.CallLog{}).WithContext(c).
		Where("room_id = ? AND (caller_id = ? OR receiver_id = ?)", roomID, userID, userID).
		Updates(updates)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
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

	// Determinar si el usuario es caller o receiver (solo columnas necesarias)
	var callLog models.CallLog
	if err := ap.data.WithContext(c).Select("id", "caller_id", "receiver_id").
		Where("caller_id = ? OR receiver_id = ?", userID, userID).
		First(&callLog, callID).Error; err != nil {
		return err
	}

	updates := map[string]interface{}{}
	if callLog.CallerID == userID {
		updates["deleted_by_caller"] = true
	}
	if callLog.ReceiverID == userID {
		updates["deleted_by_receiver"] = true
	}
	return ap.data.Model(&models.CallLog{}).WithContext(c).Where("id = ?", callID).Updates(updates).Error
}
