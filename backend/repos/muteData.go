package repos

import (
	"context"
	"gorm/backend/models"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// muteTimeout acota cada consulta del repositorio de silencios.
const muteTimeout = 5 * time.Second

// activeMuteOn es el predicado de vigencia de un silencio sobre el alias a:
// para siempre (NULL) o con vencimiento estrictamente posterior a now. Los
// silencios vencidos no se borran: se ignoran al leer.
func activeMuteOn(a string) string {
	return "(" + a + ".muted_until IS NULL OR " + a + ".muted_until > ?)"
}

// RepoMute persiste los silencios por chat (tabla chat_mutes) y responde las
// consultas que necesita el despacho de Web Push.
type RepoMute struct {
	data *gorm.DB
	ids  userIDResolver
}

// InitRepoMute crea el repositorio de silencios. ids resuelve el usuario por
// teléfono reutilizando la caché del repositorio de contactos.
func InitRepoMute(data *gorm.DB, ids userIDResolver) *RepoMute {
	return &RepoMute{data: data, ids: ids}
}

// GetIdByTelephon delega en el resolvedor de IDs (con caché).
func (r *RepoMute) GetIdByTelephon(telephon string, ctx context.Context) (int, error) {
	return r.ids.GetIdByTelephon(telephon, ctx)
}

// UpsertMute crea el silencio o, si ya existe para (usuario, tipo, destino)
// (índice único idx_chat_mutes_user_chat), actualiza su vencimiento.
// created_at se conserva.
func (r *RepoMute) UpsertMute(m *models.ChatMute, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, muteTimeout)
	defer cancel()
	return r.data.WithContext(c).
		Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "user_id"}, {Name: "chat_kind"}, {Name: "target_id"}},
			DoUpdates: clause.AssignmentColumns([]string{"muted_until", "updated_at"}),
		}).
		Create(m).Error
}

// DeleteMute quita el silencio del usuario sobre ese chat. Es idempotente:
// no existir no es error.
func (r *RepoMute) DeleteMute(userID uint, kind string, targetID uint, ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, muteTimeout)
	defer cancel()
	return r.data.WithContext(c).
		Where("user_id = ? AND chat_kind = ? AND target_id = ?", userID, kind, targetID).
		Delete(&models.ChatMute{}).Error
}

// ListActiveMutes devuelve los silencios vigentes en now del usuario, con el
// teléfono del otro usuario en los 1:1 (vacío en los grupos).
func (r *RepoMute) ListActiveMutes(userID uint, now time.Time, ctx context.Context) ([]models.ActiveMute, error) {
	c, cancel := context.WithTimeout(ctx, muteTimeout)
	defer cancel()
	var out []models.ActiveMute
	err := r.data.WithContext(c).
		Table("chat_mutes m").
		Select("m.chat_kind, m.target_id, u.telephon AS peer_telephon, m.muted_until").
		Joins("LEFT JOIN user_data_bases u ON m.chat_kind = 'direct' AND u.id = m.target_id").
		Where("m.user_id = ?", userID).
		Where(activeMuteOn("m"), now).
		Find(&out).Error
	return out, err
}

// DirectPushState lee en una sola consulta si el receptor silenció el chat
// con el remitente (vigente en now) y el estado de la fila de contacto del
// receptor hacia el remitente. Si alguno de los dos usuarios no existe
// devuelve el valor cero (no silenciado, no contacto).
func (r *RepoMute) DirectPushState(receiverTelephon, senderTelephon string, now time.Time, ctx context.Context) (models.DirectPushState, error) {
	c, cancel := context.WithTimeout(ctx, muteTimeout)
	defer cancel()
	var rows []models.DirectPushState
	err := r.data.WithContext(c).Raw(`SELECT
		EXISTS (SELECT 1 FROM chat_mutes m WHERE m.user_id = r.id AND m.chat_kind = 'direct' AND m.target_id = s.id AND `+activeMuteOn("m")+`) AS muted,
		COALESCE((SELECT c.status FROM contact_data_bases c WHERE c.id_user = r.id AND c.id_contact = s.id AND c.deleted_at IS NULL ORDER BY c.id DESC LIMIT 1), '') AS contact_status
		FROM user_data_bases r, user_data_bases s
		WHERE r.telephon = ? AND s.telephon = ? AND r.deleted_at IS NULL AND s.deleted_at IS NULL
		LIMIT 1`, now, receiverTelephon, senderTelephon).
		Find(&rows).Error
	if err != nil || len(rows) == 0 {
		return models.DirectPushState{}, err
	}
	return rows[0], nil
}

// MutedTelephonsInGroup devuelve, de entre telephons, los usuarios que tienen
// silenciado el grupo en now. Una sola consulta para todos los destinatarios;
// sin teléfonos no consulta.
func (r *RepoMute) MutedTelephonsInGroup(groupID uint, telephons []string, now time.Time, ctx context.Context) ([]string, error) {
	if len(telephons) == 0 {
		return nil, nil
	}
	c, cancel := context.WithTimeout(ctx, muteTimeout)
	defer cancel()
	var out []string
	err := r.data.WithContext(c).Raw(`SELECT u.telephon FROM chat_mutes m JOIN user_data_bases u ON u.id = m.user_id
		WHERE m.chat_kind = 'group' AND m.target_id = ? AND u.telephon IN ? AND `+activeMuteOn("m"),
		groupID, telephons, now).
		Find(&out).Error
	return out, err
}
