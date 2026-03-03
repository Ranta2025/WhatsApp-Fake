package repos

import (
	"context"
	"errors"
	"gorm/backend/models"
	"time"

	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
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

// CreateGroupWithCreator persiste un grupo nuevo y registra al creador como admin,
// todo dentro de una única transacción para garantizar consistencia.
func (r *RepoGroup) CreateGroupWithCreator(group *models.Group, creatorID uint) error {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	return r.data.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// 1. Insertar el grupo
		if err := tx.Create(group).Error; err != nil {
			return err
		}
		// 2. Insertar al creador como miembro administrador
		creator := models.GroupMember{
			GroupID:   group.ID,
			UserID:    creatorID,
			Role:      "admin",
			AddedByID: creatorID,
		}
		return tx.Create(&creator).Error
	})
}

// AddMembers inserta una lista de nuevos miembros en un grupo.
// En caso de conflicto (miembro ya existente activo), ignora el duplicado.
func (r *RepoGroup) AddMembers(groupID uint, members []models.GroupMember, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	for i := range members {
		members[i].GroupID = groupID
	}
	// ON CONFLICT DO NOTHING: si el miembro ya existe activo, no falla.
	return r.data.WithContext(c).
		Clauses().
		Create(&members).Error
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

// GetGroupMembers devuelve todos los miembros activos de un grupo con sus datos de usuario.
func (r *RepoGroup) GetGroupMembers(groupID uint, ctx context.Context) ([]models.GroupMember, error) {
	c, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	var members []models.GroupMember
	err := r.data.WithContext(c).
		Preload("User").
		Where("group_id = ?", groupID).
		Find(&members).Error
	return members, err
}

// GetUserGroups devuelve todos los grupos en los que el usuario es miembro activo.
func (r *RepoGroup) GetUserGroups(userID uint, ctx context.Context) ([]models.Group, error) {
	c, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	var groups []models.Group
	err := r.data.WithContext(c).
		Joins("JOIN group_members ON group_members.group_id = groups.id AND group_members.deleted_at IS NULL").
		Where("group_members.user_id = ? AND groups.deleted_at IS NULL", userID).
		Find(&groups).Error
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
	return r.data.WithContext(c).Create(msg).Error
}

// GetGroupMessages devuelve el historial de mensajes de un grupo con paginación,
// ordenado del más reciente al más antiguo.
func (r *RepoGroup) GetGroupMessages(groupID uint, limit, offset int, ctx context.Context) ([]models.GroupMessage, error) {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	var messages []models.GroupMessage
	err := r.data.WithContext(c).
		Preload("Sender").
		Where("group_id = ?", groupID).
		Order("created_at DESC").
		Limit(limit).
		Offset(offset).
		Find(&messages).Error
	return messages, err
}

// GetGroupMessageByID obtiene un mensaje de grupo por su ID.
func (r *RepoGroup) GetGroupMessageByID(messageID uint, ctx context.Context) (*models.GroupMessage, error) {
	c, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	var msg models.GroupMessage
	result := r.data.WithContext(c).Preload("Sender").First(&msg, messageID)
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return nil, errors.New("mensaje no encontrado")
		}
		return nil, result.Error
	}
	return &msg, nil
}

// EditGroupMessage actualiza el contenido de un mensaje, verificando que el senderID coincida.
func (r *RepoGroup) EditGroupMessage(messageID, senderID uint, newContent string, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	result := r.data.WithContext(c).
		Model(&models.GroupMessage{}).
		Where("id = ? AND sender_id = ?", messageID, senderID).
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

// DeleteGroupMessage realiza un soft-delete del mensaje, verificando que el senderID coincida.
func (r *RepoGroup) DeleteGroupMessage(messageID, senderID uint, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	result := r.data.WithContext(c).
		Where("id = ? AND sender_id = ?", messageID, senderID).
		Delete(&models.GroupMessage{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return errors.New("mensaje no encontrado o no tienes permiso para eliminarlo")
	}
	return nil
}

// LeaveGroup elimina (soft-delete) la membresía del usuario en el grupo.
func (r *RepoGroup) LeaveGroup(groupID, userID uint, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	result := r.data.WithContext(c).
		Where("group_id = ? AND user_id = ?", groupID, userID).
		Delete(&models.GroupMember{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return errors.New("no eres miembro de este grupo")
	}
	return nil
}

// UpdateGroupAvatar actualiza la URL del avatar del grupo.
func (r *RepoGroup) UpdateGroupAvatar(groupID uint, avatarUrl string, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	return r.data.WithContext(c).Model(&models.Group{}).Where("id = ?", groupID).
		Update("avatar_url", avatarUrl).Error
}
