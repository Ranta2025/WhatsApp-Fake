package repos

import (
	"context"
	"time"

	"gorm/backend/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// clientIDConflict is the ON CONFLICT target matching the partial unique
// indexes idx_messages_sender_client_id / idx_group_messages_sender_client_id
// (senderColumn, client_id) WHERE client_id IS NOT NULL. Postgres only infers a
// partial index when the same predicate is repeated in the conflict target.
func clientIDConflict(senderColumn string) clause.OnConflict {
	return clause.OnConflict{
		Columns:     []clause.Column{{Name: senderColumn}, {Name: "client_id"}},
		TargetWhere: clause.Where{Exprs: []clause.Expression{clause.Expr{SQL: "client_id IS NOT NULL"}}},
		DoNothing:   true,
	}
}

// CreateMessageIdempotent inserts a 1:1 message keyed by (id_user, client_id).
// When the key already exists (including a concurrent insert that committed
// first: ON CONFLICT waits for it), msg is replaced by the stored row and
// duplicate is true. Soft-deleted rows still own their key (the index ignores
// deleted_at), so the lookup is unscoped. A nil ClientID falls back to a plain
// insert.
func (app *ApiContact) CreateMessageIdempotent(msg *models.Message, ctx context.Context) (bool, error) {
	if msg.ClientID == nil {
		return false, app.CreateMessage(msg, ctx)
	}
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	db := app.data.WithContext(c)
	res := db.Clauses(clientIDConflict("id_user")).Create(msg)
	if res.Error != nil {
		return false, res.Error
	}
	if res.RowsAffected > 0 {
		return false, nil
	}
	var stored models.Message
	if err := db.Unscoped().
		Where("id_user = ? AND client_id = ?", msg.IdUser, *msg.ClientID).
		Take(&stored).Error; err != nil {
		return false, err
	}
	*msg = stored
	return true, nil
}

// CreateGroupMessageIdempotent is CreateGroupMessage keyed by
// (sender_id, client_id): same group-row lock (joined_message_id snapshot
// safety), plus insert-or-return-existing semantics as in
// CreateMessageIdempotent.
func (r *RepoGroup) CreateGroupMessageIdempotent(msg *models.GroupMessage, ctx context.Context) (bool, error) {
	if msg.ClientID == nil {
		return false, r.CreateGroupMessage(msg, ctx)
	}
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	duplicate := false
	err := r.data.WithContext(c).Transaction(func(tx *gorm.DB) error {
		if err := lockGroupRow(tx, msg.GroupID); err != nil {
			return err
		}
		res := tx.Clauses(clientIDConflict("sender_id")).Create(msg)
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected > 0 {
			return nil
		}
		var stored models.GroupMessage
		if err := tx.Unscoped().
			Where("sender_id = ? AND client_id = ?", msg.SenderID, *msg.ClientID).
			Take(&stored).Error; err != nil {
			return err
		}
		*msg = stored
		duplicate = true
		return nil
	})
	return duplicate, err
}
