package repos

import (
	"context"
	"errors"
	"gorm/backend/models"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// RepoReaction persiste las reacciones a mensajes (1:1 y grupo).
type RepoReaction struct {
	data *gorm.DB
}

// InitRepoReaction crea el repositorio de reacciones.
func InitRepoReaction(data *gorm.DB) *RepoReaction {
	return &RepoReaction{data: data}
}

const reactionTimeout = 5 * time.Second

// DirectMessageTarget devuelve el mensaje 1:1 si es visible para userID (mismo
// predicado que GetMessagesPage/búsqueda: no borrado para él y no borrado para
// todos). Si no existe o no es visible devuelve models.ErrMessageNotFound, sin
// distinguir los casos (no filtra su existencia).
func (r *RepoReaction) DirectMessageTarget(messageID, userID uint, ctx context.Context) (*models.ReactionTarget, error) {
	c, cancel := context.WithTimeout(ctx, reactionTimeout)
	defer cancel()

	var msg models.Message // gorm excluye los soft-deleted
	err := r.data.WithContext(c).
		Select("id", "id_user", "id_receptor", "message", "media_type").
		Where("id = ? AND "+directVisibility, messageID, userID, userID).
		First(&msg).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, models.ErrMessageNotFound
	}
	if err != nil {
		return nil, err
	}
	other := msg.IdReceptor
	if userID == msg.IdReceptor {
		other = msg.IdUser
	}
	tels, err := r.telephons(c, msg.IdUser, other)
	if err != nil {
		return nil, err
	}
	return &models.ReactionTarget{
		AuthorID: msg.IdUser, AuthorTelephon: tels[msg.IdUser],
		OtherUserID: other, OtherTelephon: tels[other],
		Text: msg.Message, MediaType: msg.MediaType,
	}, nil
}

// GroupMessageTarget devuelve el mensaje de grupo si pertenece a groupID, no
// está borrado y no es de sistema; si no, models.ErrGroupMessageNotFound.
func (r *RepoReaction) GroupMessageTarget(groupID, messageID uint, ctx context.Context) (*models.ReactionTarget, error) {
	c, cancel := context.WithTimeout(ctx, reactionTimeout)
	defer cancel()

	var msg models.GroupMessage
	err := r.data.WithContext(c).
		Select("id", "group_id", "sender_id", "message", "media_type").
		Where("id = ? AND group_id = ? AND "+systemMessageFilter, messageID, groupID).
		First(&msg).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, models.ErrGroupMessageNotFound
	}
	if err != nil {
		return nil, err
	}
	tels, err := r.telephons(c, msg.SenderID)
	if err != nil {
		return nil, err
	}
	return &models.ReactionTarget{
		AuthorID: msg.SenderID, AuthorTelephon: tels[msg.SenderID], GroupID: msg.GroupID,
		Text: msg.Message, MediaType: msg.MediaType,
	}, nil
}

// telephons resuelve id -> teléfono con una sola consulta.
func (r *RepoReaction) telephons(ctx context.Context, ids ...uint) (map[uint]string, error) {
	var users []models.UserDataBase
	if err := r.data.WithContext(ctx).Select("id", "telephon").Where("id IN ?", ids).Find(&users).Error; err != nil {
		return nil, err
	}
	out := make(map[uint]string, len(users))
	for _, u := range users {
		out[u.ID] = u.Telephon
	}
	return out, nil
}

// ActorByTelephon resuelve el id y el nombre de quien reacciona.
func (r *RepoReaction) ActorByTelephon(telephon string, ctx context.Context) (*models.ReactionActor, error) {
	c, cancel := context.WithTimeout(ctx, reactionTimeout)
	defer cancel()

	var u models.UserDataBase
	err := r.data.WithContext(c).Select("id", "username").Where("telephon = ?", telephon).First(&u).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, models.ErrUserNotFound
	}
	if err != nil {
		return nil, err
	}
	return &models.ReactionActor{ID: u.ID, Username: u.Username}, nil
}

// IsGroupMember indica si userID es miembro activo del grupo.
func (r *RepoReaction) IsGroupMember(groupID, userID uint, ctx context.Context) (bool, error) {
	c, cancel := context.WithTimeout(ctx, reactionTimeout)
	defer cancel()

	var count int64
	err := r.data.WithContext(c).
		Model(&models.GroupMember{}).
		Where("group_id = ? AND user_id = ?", groupID, userID).
		Count(&count).Error
	return count > 0, err
}

// UpsertReaction crea o reemplaza la reacción del usuario al mensaje. Devuelve
// el emoji anterior ("" si no tenía reacción) y si la fila cambió. Con el mismo
// emoji no toca la fila y devuelve changed=false. Todo ocurre en una transacción:
// primero un INSERT ... DO NOTHING (gana la carrera por la clave única) y, si la
// fila ya existía, se lee con FOR UPDATE para que el emoji anterior sea exacto
// aunque otra petición del mismo usuario compita.
func (r *RepoReaction) UpsertReaction(kind string, messageID, userID uint, emoji string, ctx context.Context) (string, bool, error) {
	c, cancel := context.WithTimeout(ctx, reactionTimeout)
	defer cancel()

	var previous string
	var changed bool
	err := r.data.WithContext(c).Transaction(func(tx *gorm.DB) error {
		// The insert may conflict with a row that is deleted before the locking
		// SELECT runs (record not found). One retry is enough: the conflicting row
		// is gone, so the second INSERT wins unless another writer re-created it,
		// in which case the SELECT then finds it.
		for attempt := 0; ; attempt++ {
			row := models.MessageReaction{MessageKind: kind, MessageID: messageID, UserID: userID, Emoji: emoji}
			res := tx.Clauses(clause.OnConflict{
				Columns:   []clause.Column{{Name: "message_kind"}, {Name: "message_id"}, {Name: "user_id"}},
				DoNothing: true,
			}).Create(&row)
			if res.Error != nil {
				return res.Error
			}
			if res.RowsAffected > 0 { // inserción nueva
				previous, changed = "", true
				return nil
			}
			var cur models.MessageReaction
			err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
				Select("id", "emoji").
				Where("message_kind = ? AND message_id = ? AND user_id = ?", kind, messageID, userID).
				First(&cur).Error
			if errors.Is(err, gorm.ErrRecordNotFound) && attempt == 0 {
				continue // deleted between the conflict and the lock: insert again
			}
			if err != nil {
				return err
			}
			previous = cur.Emoji
			if cur.Emoji == emoji {
				return nil
			}
			changed = true
			return tx.Model(&models.MessageReaction{}).Where("id = ?", cur.ID).Update("emoji", emoji).Error
		}
	})
	if err != nil {
		return "", false, err
	}
	return previous, changed, nil
}

// DeleteReaction elimina la reacción del usuario. Devuelve el emoji que tenía
// y true si había una fila que borrar (borrar lo inexistente es un no-op
// idempotente). DELETE ... RETURNING es atómico: no hace falta bloquear aparte.
func (r *RepoReaction) DeleteReaction(kind string, messageID, userID uint, ctx context.Context) (string, bool, error) {
	c, cancel := context.WithTimeout(ctx, reactionTimeout)
	defer cancel()

	var emojis []string
	err := r.data.WithContext(c).Raw(
		"DELETE FROM message_reactions WHERE message_kind = ? AND message_id = ? AND user_id = ? RETURNING emoji",
		kind, messageID, userID).Scan(&emojis).Error
	if err != nil || len(emojis) == 0 {
		return "", false, err
	}
	return emojis[0], true, nil
}

// reactionRow es la proyección mínima que se agrega en Go.
type reactionRow struct {
	MessageID uint
	UserID    uint
	Emoji     string
}

// ReactionsForMessages devuelve los agregados por mensaje (clave: id de mensaje)
// con UNA consulta. Mine se calcula para viewerID. Los mensajes sin reacciones
// no aparecen en el mapa.
func (r *RepoReaction) ReactionsForMessages(kind string, ids []uint, viewerID uint, ctx context.Context) (map[uint][]models.ReactionAggregate, error) {
	// Un *RepoReaction nil dentro de ReactionAggregator no es == nil: se trata
	// como "sin reacciones" en vez de provocar un pánico.
	if r == nil || len(ids) == 0 {
		return map[uint][]models.ReactionAggregate{}, nil
	}
	c, cancel := context.WithTimeout(ctx, reactionTimeout)
	defer cancel()

	var rows []reactionRow
	err := r.data.WithContext(c).Model(&models.MessageReaction{}).
		Select("message_id", "user_id", "emoji").
		Where("message_kind = ? AND message_id IN ?", kind, ids).
		Order("created_at ASC, id ASC").
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	return aggregateReactions(rows, viewerID), nil
}

// aggregateReactions agrupa filas (ya ordenadas por creación) en agregados por
// mensaje: más reacciones primero y, en empate, el emoji que apareció antes.
func aggregateReactions(rows []reactionRow, viewerID uint) map[uint][]models.ReactionAggregate {
	out := make(map[uint][]models.ReactionAggregate)
	index := make(map[uint]map[string]int) // messageID -> emoji -> posición en out[messageID]
	for _, row := range rows {
		pos, ok := index[row.MessageID]
		if !ok {
			pos = make(map[string]int)
			index[row.MessageID] = pos
		}
		i, seen := pos[row.Emoji]
		if !seen {
			i = len(out[row.MessageID])
			pos[row.Emoji] = i
			out[row.MessageID] = append(out[row.MessageID], models.ReactionAggregate{Emoji: row.Emoji})
		}
		agg := &out[row.MessageID][i]
		agg.Count++
		if row.UserID == viewerID {
			agg.Mine = true
		}
	}
	for id, aggs := range out {
		stableSortAggregates(aggs)
		out[id] = aggs
	}
	return out
}

// stableSortAggregates ordena por Count desc conservando el orden de aparición.
func stableSortAggregates(aggs []models.ReactionAggregate) {
	for i := 1; i < len(aggs); i++ { // inserción: listas de pocos elementos
		for j := i; j > 0 && aggs[j].Count > aggs[j-1].Count; j-- {
			aggs[j], aggs[j-1] = aggs[j-1], aggs[j]
		}
	}
}

// ListReactionUsers devuelve, por emoji, los usuarios que reaccionaron al mensaje
// (emojis en el mismo orden que ReactionsForMessages; usuarios por antigüedad).
func (r *RepoReaction) ListReactionUsers(kind string, messageID uint, ctx context.Context) ([]models.ReactionUsers, error) {
	c, cancel := context.WithTimeout(ctx, reactionTimeout)
	defer cancel()

	type row struct {
		Emoji     string
		Telephon  string
		Username  string
		AvatarUrl string
	}
	var rows []row
	err := r.data.WithContext(c).Table("message_reactions AS mr").
		Select("mr.emoji AS emoji, u.telephon AS telephon, u.username AS username, u.avatar_url AS avatar_url").
		Joins("JOIN user_data_bases u ON u.id = mr.user_id").
		Where("mr.message_kind = ? AND mr.message_id = ?", kind, messageID).
		Order("mr.created_at ASC, mr.id ASC").
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}

	var order []string
	users := make(map[string][]models.ReactionUser)
	for _, rw := range rows {
		if _, ok := users[rw.Emoji]; !ok {
			order = append(order, rw.Emoji)
		}
		users[rw.Emoji] = append(users[rw.Emoji], models.ReactionUser{
			Telephon: rw.Telephon, Username: rw.Username, AvatarUrl: rw.AvatarUrl,
		})
	}
	// count desc, estable respecto al primer aparecido
	for i := 1; i < len(order); i++ {
		for j := i; j > 0 && len(users[order[j]]) > len(users[order[j-1]]); j-- {
			order[j], order[j-1] = order[j-1], order[j]
		}
	}
	out := make([]models.ReactionUsers, 0, len(order))
	for _, e := range order {
		out = append(out, models.ReactionUsers{Emoji: e, Users: users[e]})
	}
	return out, nil
}
