package repos

import (
	"context"
	"errors"
	"strconv"
	"time"

	"gorm/backend/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const disappearingTimeout = 10 * time.Second

// systemMessageSeenStatus es el status con el que se persiste un mensaje de
// sistema 1:1. 'visto' (y no 'enviado'): así no entra en el índice de
// pendientes de entrega (status = 'enviado'), no se re-entrega al reconectar y
// no cuenta como no leído para el receptor.
const systemMessageSeenStatus = "visto"

// prepareChatSystemMessage rellena (o crea) el mensaje de sistema 1:1
// `disappearing_changed`: el remitente es el actor y Message guarda el valor
// nuevo en segundos. No fija ExpiresAt: los mensajes de sistema no expiran.
func prepareChatSystemMessage(msg *models.Message, actorID, otherID uint, seconds int) *models.Message {
	if msg == nil {
		msg = &models.Message{}
	}
	msg.IdUser = actorID
	msg.IdReceptor = otherID
	msg.Kind = models.MessageKindSystem
	msg.SystemEvent = models.SystemEventDisappearingChanged
	msg.Message = strconv.Itoa(seconds)
	msg.Status = systemMessageSeenStatus
	msg.Time = time.Now()
	msg.ExpiresAt = nil
	return msg
}

// GetChatDisappearing devuelve el temporizador del chat 1:1 (0 si no hay fila).
func (app *ApiContact) GetChatDisappearing(userA, userB uint, ctx context.Context) (int, error) {
	c, cancel := context.WithTimeout(ctx, disappearingTimeout)
	defer cancel()
	low, high := models.OrderedPair(userA, userB)
	var setting models.ChatSetting
	err := app.data.WithContext(c).
		Where("user_low_id = ? AND user_high_id = ?", low, high).
		First(&setting).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	return setting.DisappearSeconds, nil
}

// GetChatDisappearingForUser devuelve, en UNA consulta, el temporizador (>0) de
// todos los chats 1:1 del usuario: mapa id del otro participante -> segundos.
func (app *ApiContact) GetChatDisappearingForUser(userID uint, ctx context.Context) (map[uint]int, error) {
	c, cancel := context.WithTimeout(ctx, disappearingTimeout)
	defer cancel()
	var rows []models.ChatSetting
	err := app.data.WithContext(c).
		Where("(user_low_id = ? OR user_high_id = ?) AND disappear_seconds > 0", userID, userID).
		Find(&rows).Error
	if err != nil {
		return nil, err
	}
	out := make(map[uint]int, len(rows))
	for _, r := range rows {
		other := r.UserLowID
		if other == userID {
			other = r.UserHighID
		}
		out[other] = r.DisappearSeconds
	}
	return out, nil
}

// SetChatDisappearing cambia el temporizador del chat 1:1 en UNA transacción:
// asegura la fila del par ordenado (ON CONFLICT DO NOTHING), la bloquea
// (FOR UPDATE) y, solo si el valor cambia, la actualiza e inserta el mensaje
// de sistema. Si el valor no cambia devuelve changed=false y no inserta nada.
func (app *ApiContact) SetChatDisappearing(actorID, otherID uint, seconds int, sysMsg *models.Message, ctx context.Context) (bool, *models.Message, error) {
	c, cancel := context.WithTimeout(ctx, disappearingTimeout)
	defer cancel()

	low, high := models.OrderedPair(actorID, otherID)
	var (
		changed bool
		saved   *models.Message
	)
	err := app.data.WithContext(c).Transaction(func(tx *gorm.DB) error {
		seed := models.ChatSetting{UserLowID: low, UserHighID: high}
		if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&seed).Error; err != nil {
			return err
		}
		var current models.ChatSetting
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("user_low_id = ? AND user_high_id = ?", low, high).
			First(&current).Error; err != nil {
			return err
		}
		if current.DisappearSeconds == seconds {
			return nil
		}
		if err := tx.Model(&models.ChatSetting{}).Where("id = ?", current.ID).
			Updates(map[string]interface{}{
				"disappear_seconds": seconds,
				"updated_by_id":     actorID,
				"updated_at":        time.Now(),
			}).Error; err != nil {
			return err
		}
		msg := prepareChatSystemMessage(sysMsg, actorID, otherID, seconds)
		if err := tx.Create(msg).Error; err != nil {
			return err
		}
		changed, saved = true, msg
		return nil
	})
	if err != nil {
		return false, nil, err
	}
	return changed, saved, nil
}

// GetGroupDisappearing devuelve el temporizador del grupo.
func (r *RepoGroup) GetGroupDisappearing(groupID uint, ctx context.Context) (int, error) {
	c, cancel := context.WithTimeout(ctx, disappearingTimeout)
	defer cancel()
	var g models.Group
	if err := r.data.WithContext(c).Select("id", "disappear_seconds").First(&g, groupID).Error; err != nil {
		return 0, err
	}
	return g.DisappearSeconds, nil
}

// SetGroupDisappearing cambia el temporizador del grupo. Refleja UpdateGroupInfo:
// bloquea la fila del grupo, re-verifica que el actor siga siendo miembro activo
// (el permiso fino requireCanEditInfo lo aplica el servicio) y, solo si el valor
// cambia, actualiza groups.disappear_seconds e inserta el mensaje de sistema.
func (r *RepoGroup) SetGroupDisappearing(actorID, groupID uint, seconds int, sysMsg *models.GroupMessage, ctx context.Context) (bool, *models.GroupMessage, error) {
	c, cancel := context.WithTimeout(ctx, disappearingTimeout)
	defer cancel()

	var (
		changed bool
		saved   *models.GroupMessage
	)
	err := r.data.WithContext(c).Transaction(func(tx *gorm.DB) error {
		if err := lockGroupRow(tx, groupID); err != nil {
			return err
		}
		if err := requireActiveMemberTx(tx, groupID, actorID); err != nil {
			return err
		}
		var current models.Group
		if err := tx.Select("id", "disappear_seconds").First(&current, groupID).Error; err != nil {
			return err
		}
		if current.DisappearSeconds == seconds {
			return nil
		}
		if err := tx.Model(&models.Group{}).Where("id = ?", groupID).
			Update("disappear_seconds", seconds).Error; err != nil {
			return err
		}
		if err := insertSystemMessage(tx, sysMsg); err != nil {
			return err
		}
		changed, saved = true, sysMsg
		return nil
	})
	if err != nil {
		return false, nil, err
	}
	return changed, saved, nil
}
