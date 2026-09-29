package repos

import (
	"context"
	"errors"
	"gorm/backend/models"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// mergeWatermarks aplica la semántica de acuses: las marcas solo avanzan
// (GREATEST), quedan acotadas al máximo id de mensaje del grupo y una lectura
// implica la entrega. Devuelve el nuevo estado y si algo cambió.
func mergeWatermarks(cur models.GroupReceiptState, deliveredUpTo, readUpTo, maxID uint) (models.GroupReceiptState, bool) {
	capTo := func(v uint) uint {
		if v > maxID {
			return maxID
		}
		return v
	}
	next := cur
	if v := capTo(deliveredUpTo); v > next.DeliveredUpTo {
		next.DeliveredUpTo = v
	}
	if v := capTo(readUpTo); v > next.ReadUpTo {
		next.ReadUpTo = v
	}
	if next.ReadUpTo > next.DeliveredUpTo {
		next.DeliveredUpTo = next.ReadUpTo
	}
	return next, next != cur
}

// AdvanceMemberReceipts avanza de forma monótona las marcas de entrega/lectura
// del miembro (acotadas al último mensaje del grupo) bajo bloqueo de fila.
// Devuelve el estado resultante y si hubo cambios; error si no es miembro activo.
func (r *RepoGroup) AdvanceMemberReceipts(groupID, userID, deliveredUpTo, readUpTo uint, ctx context.Context) (models.GroupReceiptState, bool, error) {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	var (
		state   models.GroupReceiptState
		changed bool
	)
	err := r.data.WithContext(c).Transaction(func(tx *gorm.DB) error {
		var m models.GroupMember
		err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("group_id = ? AND user_id = ?", groupID, userID).
			First(&m).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return errors.New("el usuario no es miembro del grupo")
		}
		if err != nil {
			return err
		}

		maxID, err := maxGroupMessageID(tx, groupID)
		if err != nil {
			return err
		}

		cur := models.GroupReceiptState{DeliveredUpTo: m.LastDeliveredMessageID, ReadUpTo: m.LastReadMessageID}
		state, changed = mergeWatermarks(cur, deliveredUpTo, readUpTo, maxID)
		if !changed {
			return nil
		}
		now := time.Now()
		updates := map[string]interface{}{}
		if state.DeliveredUpTo != cur.DeliveredUpTo {
			updates["last_delivered_message_id"] = state.DeliveredUpTo
			updates["last_delivered_at"] = now
		}
		if state.ReadUpTo != cur.ReadUpTo {
			updates["last_read_message_id"] = state.ReadUpTo
			updates["last_read_at"] = now
		}
		return tx.Model(&models.GroupMember{}).Where("id = ?", m.ID).Updates(updates).Error
	})
	if err != nil {
		return models.GroupReceiptState{}, false, err
	}
	return state, changed, nil
}

// maxGroupMessageID devuelve el mayor id de mensaje del grupo (0 si no hay),
// incluidos los borrados: los ids son seriales y las marcas los comparan.
func maxGroupMessageID(tx *gorm.DB, groupID uint) (uint, error) {
	var maxID uint
	err := tx.Model(&models.GroupMessage{}).
		Unscoped().
		Where("group_id = ?", groupID).
		Select("COALESCE(MAX(id), 0)").
		Scan(&maxID).Error
	return maxID, err
}
