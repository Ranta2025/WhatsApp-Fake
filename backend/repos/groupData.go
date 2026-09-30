package repos

import (
	"context"
	"errors"
	"gorm/backend/models"
	"time"

	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// RepoGroup implementa todas las operaciones de base de datos relacionadas con grupos.
type RepoGroup struct {
	data *gorm.DB
	rd   *redis.Client
}

// InitRepoGroup crea el repositorio de grupos con la conexión GORM y Redis.
func InitRepoGroup(data *gorm.DB, rd *redis.Client) *RepoGroup {
	return &RepoGroup{data: data, rd: rd}
}

// ─────────────────────────────────────────────────────────────────────────────
// Grupos
// ─────────────────────────────────────────────────────────────────────────────

// CreateGroupWithMembers persiste un grupo nuevo, registra al creador como
// admin y añade los miembros iniciales, todo dentro de una única transacción:
// o se crea el grupo completo o no se crea nada.
func (r *RepoGroup) CreateGroupWithMembers(group *models.Group, creatorID uint, memberIDs []uint, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	return r.data.WithContext(c).Transaction(func(tx *gorm.DB) error {
		// 1. Insertar el grupo
		if err := tx.Create(group).Error; err != nil {
			return err
		}
		// 2. Insertar al creador como administrador y a los miembros iniciales
		members := make([]models.GroupMember, 0, len(memberIDs)+1)
		members = append(members, models.GroupMember{
			GroupID:   group.ID,
			UserID:    creatorID,
			Role:      "admin",
			AddedByID: creatorID,
		})
		for _, id := range memberIDs {
			members = append(members, models.GroupMember{
				GroupID:   group.ID,
				UserID:    id,
				Role:      "member",
				AddedByID: creatorID,
			})
		}
		return tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&members).Error
	})
}

// systemMessageFilter es el predicado que excluye los mensajes de sistema de
// las lecturas/operaciones que no deben verlos (búsqueda, edición, borrado y
// respuestas).
const systemMessageFilter = "COALESCE(kind,'') = ''"

// insertSystemMessage persiste un mensaje de sistema DENTRO de la transacción
// del caller (nunca abre su propia transacción): así el evento y el cambio de
// estado son atómicos. Es nil-safe.
func insertSystemMessage(tx *gorm.DB, msg *models.GroupMessage) error {
	if msg == nil {
		return nil
	}
	return tx.Create(msg).Error
}

// systemTargetsFromMembers extrae los teléfonos de los miembros insertados (con
// su usuario precargado), en el orden en que quedaron persistidos.
func systemTargetsFromMembers(members []models.GroupMember) []string {
	out := make([]string, 0, len(members))
	for _, m := range members {
		if m.User.Telephon != "" {
			out = append(out, m.User.Telephon)
		}
	}
	return out
}

// AddMembers inserta los miembros que aún no son activos y devuelve los
// realmente añadidos (con su usuario precargado). Un miembro ya activo no
// cuenta como añadido. Cuando `system` no es nil y hubo altas, persiste el
// mensaje de sistema en la MISMA transacción del alta.
func (r *RepoGroup) AddMembers(groupID uint, members []models.GroupMember, system *models.GroupMessage, ctx context.Context) ([]models.GroupMember, error) {
	if len(members) == 0 {
		return nil, nil
	}
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	// El snapshot del máximo id y el alta van en la misma transacción para que
	// el miembro nuevo no cuente en los acuses de mensajes anteriores a su alta.
	var added []models.GroupMember
	err := r.data.WithContext(c).Transaction(func(tx *gorm.DB) error {
		// Bloqueo del grupo: espera a los inserts de mensajes en vuelo (ver CreateGroupMessage).
		if err := lockGroupRow(tx, groupID); err != nil {
			return err
		}
		joinedAt, err := maxGroupMessageID(tx, groupID)
		if err != nil {
			return err
		}

		requested := make([]uint, 0, len(members))
		for _, m := range members {
			requested = append(requested, m.UserID)
		}
		// Miembros ya activos: no se reinsertan ni cuentan como "añadidos".
		var existing []uint
		if err := tx.Model(&models.GroupMember{}).
			Where("group_id = ? AND user_id IN ?", groupID, requested).
			Pluck("user_id", &existing).Error; err != nil {
			return err
		}
		active := make(map[uint]struct{}, len(existing))
		for _, id := range existing {
			active[id] = struct{}{}
		}

		toAdd := make([]models.GroupMember, 0, len(members))
		for _, m := range members {
			if _, ok := active[m.UserID]; ok {
				continue
			}
			m.GroupID = groupID
			m.JoinedMessageID = joinedAt
			toAdd = append(toAdd, m)
		}
		if len(toAdd) == 0 {
			return nil
		}
		// ON CONFLICT DO NOTHING: protege ante una carrera con otro alta (el
		// lock de grupo ya serializa, pero el índice parcial es la garantía).
		if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&toAdd).Error; err != nil {
			return err
		}

		ids := make([]uint, 0, len(toAdd))
		for _, m := range toAdd {
			ids = append(ids, m.UserID)
		}
		if err := tx.Preload("User", selectUserBasic).
			Where("group_id = ? AND user_id IN ?", groupID, ids).
			Find(&added).Error; err != nil {
			return err
		}
		if len(added) == 0 {
			return nil
		}
		if system != nil {
			system.GroupID = groupID
			system.Time = time.Now()
			system.SystemTargets = systemTargetsFromMembers(added)
			if err := insertSystemMessage(tx, system); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return added, nil
}

// GetGroupByID obtiene los datos de un grupo por su ID.
func (r *RepoGroup) GetGroupByID(groupID uint, ctx context.Context) (*models.Group, error) {
	c, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	var group models.Group
	result := r.data.WithContext(c).First(&group, groupID)
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return nil, errors.New("grupo no encontrado")
		}
		return nil, result.Error
	}
	return &group, nil
}

// selectUserBasic limita las columnas cargadas al precargar usuarios
// (evita traer password, email, etc. a memoria).
func selectUserBasic(db *gorm.DB) *gorm.DB {
	return db.Select("id", "telephon", "username", "avatar_url")
}

// GetGroupMembers devuelve todos los miembros activos de un grupo con sus datos de usuario.
func (r *RepoGroup) GetGroupMembers(groupID uint, ctx context.Context) ([]models.GroupMember, error) {
	c, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	var members []models.GroupMember
	err := r.data.WithContext(c).
		Preload("User", selectUserBasic).
		Where("group_id = ?", groupID).
		Order("created_at ASC").
		Find(&members).Error
	return members, err
}

// GetUserGroups devuelve todos los grupos en los que el usuario es miembro activo,
// junto con su rol, el número de miembros y el teléfono del creador, en una sola
// consulta (antes: 3 consultas extra por grupo).
func (r *RepoGroup) GetUserGroups(userID uint, ctx context.Context) ([]models.UserGroupRow, error) {
	c, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	var groups []models.UserGroupRow
	err := r.data.WithContext(c).
		Table("groups").
		Select(`groups.*,
			me.role AS user_role,
			(SELECT COUNT(*) FROM group_members gm
				WHERE gm.group_id = groups.id AND gm.deleted_at IS NULL) AS member_count,
			creator.telephon AS creator_telephon`).
		Joins("JOIN group_members me ON me.group_id = groups.id AND me.user_id = ? AND me.deleted_at IS NULL", userID).
		Joins("LEFT JOIN user_data_bases creator ON creator.id = groups.creator_id").
		Where("groups.deleted_at IS NULL").
		Order("groups.created_at DESC").
		Scan(&groups).Error
	return groups, err
}

// IsMember verifica si un usuario es miembro activo de un grupo.
func (r *RepoGroup) IsMember(groupID, userID uint, ctx context.Context) (bool, error) {
	c, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	var count int64
	err := r.data.WithContext(c).
		Model(&models.GroupMember{}).
		Where("group_id = ? AND user_id = ?", groupID, userID).
		Count(&count).Error
	return count > 0, err
}

// GetMemberRole retorna el rol ("admin"/"member") de un usuario en un grupo.
// Devuelve error si el usuario no es miembro.
func (r *RepoGroup) GetMemberRole(groupID, userID uint, ctx context.Context) (string, error) {
	c, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	var member models.GroupMember
	result := r.data.WithContext(c).
		Where("group_id = ? AND user_id = ?", groupID, userID).
		First(&member)
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return "", errors.New("el usuario no es miembro del grupo")
		}
		return "", result.Error
	}
	return member.Role, nil
}

// GetMemberTelephons retorna los números de teléfono de todos los miembros activos de un grupo.
// Usado para enviar mensajes grupales por WebSocket.
func (r *RepoGroup) GetMemberTelephons(groupID uint, ctx context.Context) ([]string, error) {
	c, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	var telephons []string
	err := r.data.WithContext(c).
		Table("group_members").
		Select("user_data_bases.telephon").
		Joins("JOIN user_data_bases ON user_data_bases.id = group_members.user_id AND user_data_bases.deleted_at IS NULL").
		Where("group_members.group_id = ? AND group_members.deleted_at IS NULL", groupID).
		Pluck("user_data_bases.telephon", &telephons).Error
	return telephons, err
}

// GetMemberCount retorna el número de miembros activos de un grupo.
func (r *RepoGroup) GetMemberCount(groupID uint, ctx context.Context) (int, error) {
	c, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	var count int64
	err := r.data.WithContext(c).
		Model(&models.GroupMember{}).
		Where("group_id = ?", groupID).
		Count(&count).Error
	return int(count), err
}

// ─────────────────────────────────────────────────────────────────────────────
// Mensajes de grupo
// ─────────────────────────────────────────────────────────────────────────────

// CreateGroupMessage persiste un nuevo mensaje en el grupo.
func (r *RepoGroup) CreateGroupMessage(msg *models.GroupMessage, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	// Se serializa con AddMembers bloqueando la fila del grupo: así el snapshot
	// joined_message_id (MAX(id)) nunca omite un id ya asignado pero sin commit.
	return r.data.WithContext(c).Transaction(func(tx *gorm.DB) error {
		if err := lockGroupRow(tx, msg.GroupID); err != nil {
			return err
		}
		return tx.Create(msg).Error
	})
}

// lockGroupRow toma un bloqueo exclusivo de la fila del grupo hasta el fin de la
// transacción (SELECT ... FOR UPDATE).
func lockGroupRow(tx *gorm.DB, groupID uint) error {
	var id uint
	return tx.Model(&models.Group{}).
		Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("id = ?", groupID).
		Select("id").
		Scan(&id).Error
}

// GetGroupMessages devuelve el historial de mensajes de un grupo con paginación,
// ordenado del más reciente al más antiguo.
func (r *RepoGroup) GetGroupMessages(groupID uint, limit, offset int, ctx context.Context) ([]models.GroupMessage, error) {
	messages, _, err := r.GetGroupMessagesPage(groupID, 0, limit, offset, ctx)
	return messages, err
}

// GetGroupMessagesPage devuelve una página del historial (más reciente primero).
// Si before > 0 solo incluye mensajes con id < before (cursor por id, estable
// aunque varias filas compartan timestamp). hasMore indica si existen mensajes
// más antiguos que el último devuelto; se calcula pidiendo limit+1 filas.
func (r *RepoGroup) GetGroupMessagesPage(groupID, before uint, limit, offset int, ctx context.Context) ([]models.GroupMessage, bool, error) {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	q := r.data.WithContext(c).
		Preload("Sender", selectUserBasic).
		Where("group_id = ?", groupID)
	if before > 0 {
		q = q.Where("id < ?", before)
	}

	var messages []models.GroupMessage
	err := q.Order("id DESC").
		Limit(limit + 1).
		Offset(offset).
		Find(&messages).Error
	if err != nil {
		return nil, false, err
	}
	hasMore := len(messages) > limit
	if hasMore {
		messages = messages[:limit]
	}
	return messages, hasMore, nil
}

// GetGroupMessagesAround devuelve una ventana cronológica (más antiguo primero)
// centrada en around: hasta limit/2 mensajes anteriores, el objetivo y hasta
// limit/2 posteriores. Si el mensaje no existe, está borrado o es de otro grupo
// devuelve models.ErrGroupMessageNotFound.
func (r *RepoGroup) GetGroupMessagesAround(groupID, around uint, limit int, ctx context.Context) ([]models.GroupMessage, bool, bool, error) {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	half := limit / 2
	if half < 1 {
		half = 1
	}
	base := func() *gorm.DB {
		return r.data.WithContext(c).Preload("Sender", selectUserBasic).Where("group_id = ?", groupID)
	}

	var target models.GroupMessage
	if err := base().Where("id = ?", around).First(&target).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, false, false, models.ErrGroupMessageNotFound
		}
		return nil, false, false, err
	}
	var older, newer []models.GroupMessage
	if err := base().Where("id < ?", around).Order("id DESC").Limit(half + 1).Find(&older).Error; err != nil {
		return nil, false, false, err
	}
	if err := base().Where("id > ?", around).Order("id ASC").Limit(half + 1).Find(&newer).Error; err != nil {
		return nil, false, false, err
	}
	hasOlder := len(older) > half
	if hasOlder {
		older = older[:half]
	}
	hasNewer := len(newer) > half
	if hasNewer {
		newer = newer[:half]
	}
	out := make([]models.GroupMessage, 0, len(older)+1+len(newer))
	for i := len(older) - 1; i >= 0; i-- {
		out = append(out, older[i])
	}
	out = append(out, target)
	out = append(out, newer...)
	return out, hasOlder, hasNewer, nil
}

// GetGroupMessagesAfter devuelve hasta limit mensajes con id > after en orden
// cronológico; hasNewer indica si quedan más posteriores.
func (r *RepoGroup) GetGroupMessagesAfter(groupID, after uint, limit int, ctx context.Context) ([]models.GroupMessage, bool, error) {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	var msgs []models.GroupMessage
	err := r.data.WithContext(c).Preload("Sender", selectUserBasic).
		Where("group_id = ? AND id > ?", groupID, after).
		Order("id ASC").Limit(limit + 1).Find(&msgs).Error
	if err != nil {
		return nil, false, err
	}
	hasNewer := len(msgs) > limit
	if hasNewer {
		msgs = msgs[:limit]
	}
	return msgs, hasNewer, nil
}

// GetGroupMessageByID obtiene un mensaje de grupo por su ID.
func (r *RepoGroup) GetGroupMessageByID(messageID uint, ctx context.Context) (*models.GroupMessage, error) {
	c, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	var msg models.GroupMessage
	result := r.data.WithContext(c).Preload("Sender", selectUserBasic).First(&msg, messageID)
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return nil, models.ErrGroupMessageNotFound
		}
		return nil, result.Error
	}
	return &msg, nil
}

// EditGroupMessage actualiza el contenido de un mensaje del grupo, verificando
// que pertenezca a ese grupo y que senderID sea su autor.
func (r *RepoGroup) EditGroupMessage(groupID, messageID, senderID uint, newContent string, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	result := r.data.WithContext(c).
		Model(&models.GroupMessage{}).
		Where("id = ? AND group_id = ? AND sender_id = ? AND "+systemMessageFilter, messageID, groupID, senderID).
		Updates(map[string]interface{}{
			"message": newContent,
			"edited":  true,
		})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return errors.New("mensaje no encontrado o no tienes permiso para editarlo")
	}
	return nil
}

// DeleteGroupMessage realiza un soft-delete del mensaje, verificando que
// pertenezca al grupo y que senderID sea su autor.
func (r *RepoGroup) DeleteGroupMessage(groupID, messageID, senderID uint, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	result := r.data.WithContext(c).
		Where("id = ? AND group_id = ? AND sender_id = ? AND "+systemMessageFilter, messageID, groupID, senderID).
		Delete(&models.GroupMessage{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return errors.New("mensaje no encontrado o no tienes permiso para eliminarlo")
	}
	return nil
}

// LeaveGroup elimina (soft-delete) la membresía del usuario en el grupo. Si era
// el último administrador y quedan miembros, promueve a administrador al miembro
// más antiguo para que el grupo no quede sin admin. Cuando `system` no es nil,
// persiste el mensaje de sistema member_left en la misma transacción.
func (r *RepoGroup) LeaveGroup(groupID, userID uint, system *models.GroupMessage, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	return r.data.WithContext(c).Transaction(func(tx *gorm.DB) error {
		result := tx.Where("group_id = ? AND user_id = ?", groupID, userID).
			Delete(&models.GroupMember{})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return errors.New("no eres miembro de este grupo")
		}

		var admins int64
		if err := tx.Model(&models.GroupMember{}).
			Where("group_id = ? AND role = ?", groupID, models.GroupRoleAdmin).
			Count(&admins).Error; err != nil {
			return err
		}
		if admins == 0 {
			var remaining []models.GroupMember
			if err := tx.Where("group_id = ?", groupID).Find(&remaining).Error; err != nil {
				return err
			}
			oldest := promotionCandidate(remaining)
			if oldest != nil {
				// El grupo no debe quedar sin admin (el que sale ya no cuenta).
				if err := tx.Model(oldest).Update("role", models.GroupRoleAdmin).Error; err != nil {
					return err
				}
			}
		}
		return insertSystemMessage(tx, system)
	})
}

// promotionCandidate devuelve el miembro que debe ser promovido a admin cuando
// el grupo se queda sin ninguno: el más antiguo por created_at y, en empate de
// timestamp, el de menor id (determinista aunque dos altas compartan instante).
// Devuelve nil si no quedan miembros.
func promotionCandidate(members []models.GroupMember) *models.GroupMember {
	if len(members) == 0 {
		return nil
	}
	best := &members[0]
	for i := 1; i < len(members); i++ {
		candidate := &members[i]
		if candidate.CreatedAt.Before(best.CreatedAt) ||
			(candidate.CreatedAt.Equal(best.CreatedAt) && candidate.ID < best.ID) {
			best = candidate
		}
	}
	return best
}

// UpdateGroupAvatar actualiza la URL del avatar del grupo.
func (r *RepoGroup) UpdateGroupAvatar(groupID uint, avatarUrl string, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	return r.data.WithContext(c).Model(&models.Group{}).Where("id = ?", groupID).
		Update("avatar_url", avatarUrl).Error
}

// ─────────────────────────────────────────────────────────────────────────────
// Administración de miembros
// ─────────────────────────────────────────────────────────────────────────────

// ChangeMemberRole cambia el rol de un miembro en una única transacción con lock
// de grupo: re-verifica el actor (admin activo) y el objetivo (miembro activo,
// distinto del actor, con un rol nuevo distinto del actual) y persiste el
// mensaje de sistema `admin_granted`/`admin_revoked` de forma atómica.
func (r *RepoGroup) ChangeMemberRole(groupID, actorID, targetID uint, newRole string, system *models.GroupMessage, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	return r.data.WithContext(c).Transaction(func(tx *gorm.DB) error {
		if err := lockGroupRow(tx, groupID); err != nil {
			return err
		}
		actorRole, actorActive, err := memberRoleTx(tx, groupID, actorID)
		if err != nil {
			return err
		}
		targetRole, targetActive, err := memberRoleTx(tx, groupID, targetID)
		if err != nil {
			return err
		}
		if err := membershipDecision(actorID, targetID, actorRole, actorActive, targetRole, targetActive, newRole, true); err != nil {
			return err
		}
		if err := tx.Model(&models.GroupMember{}).
			Where("group_id = ? AND user_id = ?", groupID, targetID).
			Update("role", newRole).Error; err != nil {
			return err
		}
		return insertSystemMessage(tx, system)
	})
}

// RemoveMember elimina (soft-delete) la membresía de un miembro en una única
// transacción con lock de grupo: re-verifica el actor y el objetivo y persiste
// el mensaje de sistema `member_removed`.
func (r *RepoGroup) RemoveMember(groupID, actorID, targetID uint, system *models.GroupMessage, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	return r.data.WithContext(c).Transaction(func(tx *gorm.DB) error {
		if err := lockGroupRow(tx, groupID); err != nil {
			return err
		}
		actorRole, actorActive, err := memberRoleTx(tx, groupID, actorID)
		if err != nil {
			return err
		}
		targetRole, targetActive, err := memberRoleTx(tx, groupID, targetID)
		if err != nil {
			return err
		}
		if err := membershipDecision(actorID, targetID, actorRole, actorActive, targetRole, targetActive, "", false); err != nil {
			return err
		}
		result := tx.Where("group_id = ? AND user_id = ?", groupID, targetID).
			Delete(&models.GroupMember{})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return models.ErrGroupTargetNotMember
		}
		return insertSystemMessage(tx, system)
	})
}

// UpdateGroupSettings aplica solo los campos presentes del PATCH y devuelve el
// grupo resultante. Re-verifica el actor (admin activo) bajo lock y persiste el
// mensaje de sistema `settings_changed`.
func (r *RepoGroup) UpdateGroupSettings(groupID, actorID uint, patch models.GroupSettingsUpdate, system *models.GroupMessage, ctx context.Context) (*models.Group, error) {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	var updated models.Group
	err := r.data.WithContext(c).Transaction(func(tx *gorm.DB) error {
		if err := lockGroupRow(tx, groupID); err != nil {
			return err
		}
		if err := requireAdminTx(tx, groupID, actorID); err != nil {
			return err
		}
		updates := map[string]interface{}{}
		if patch.OnlyAdminsCanSend != nil {
			updates["only_admins_can_send"] = *patch.OnlyAdminsCanSend
		}
		if patch.OnlyAdminsCanEditInfo != nil {
			updates["only_admins_can_edit_info"] = *patch.OnlyAdminsCanEditInfo
		}
		if patch.OnlyAdminsCanAddMembers != nil {
			updates["only_admins_can_add_members"] = *patch.OnlyAdminsCanAddMembers
		}
		if len(updates) > 0 {
			if err := tx.Model(&models.Group{}).Where("id = ?", groupID).Updates(updates).Error; err != nil {
				return err
			}
		}
		if err := tx.First(&updated, groupID).Error; err != nil {
			return err
		}
		return insertSystemMessage(tx, system)
	})
	if err != nil {
		return nil, err
	}
	return &updated, nil
}

// UpdateGroupInfo aplica solo los campos presentes del PATCH y devuelve el grupo
// resultante. Re-verifica que el actor siga siendo miembro activo bajo lock (el
// permiso fino de edición lo aplica el servicio según la matriz) y persiste el
// mensaje de sistema `info_changed`.
func (r *RepoGroup) UpdateGroupInfo(groupID, actorID uint, name, description *string, system *models.GroupMessage, ctx context.Context) (*models.Group, error) {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	var updated models.Group
	err := r.data.WithContext(c).Transaction(func(tx *gorm.DB) error {
		if err := lockGroupRow(tx, groupID); err != nil {
			return err
		}
		if err := requireActiveMemberTx(tx, groupID, actorID); err != nil {
			return err
		}
		updates := map[string]interface{}{}
		if name != nil {
			updates["name"] = *name
		}
		if description != nil {
			updates["description"] = *description
		}
		if len(updates) > 0 {
			if err := tx.Model(&models.Group{}).Where("id = ?", groupID).Updates(updates).Error; err != nil {
				return err
			}
		}
		if err := tx.First(&updated, groupID).Error; err != nil {
			return err
		}
		return insertSystemMessage(tx, system)
	})
	if err != nil {
		return nil, err
	}
	return &updated, nil
}
