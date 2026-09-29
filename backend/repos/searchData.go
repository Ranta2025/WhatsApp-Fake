package repos

import (
	"context"
	"gorm/backend/models"
	"gorm/backend/utils"
	"log"
	"strings"
	"sync"
	"time"

	"gorm.io/gorm"
)

// Búsqueda de mensajes de texto. Se apoya en la función IMMUTABLE norm(text) =
// lower(unaccent(text)) y en los índices GIN trigram parciales creados en
// database/postgres.go. Si la extensión no está disponible (hosts gestionados)
// se cae a `ILIKE`, sin ignorar acentos.

// searchVisibleText es el predicado base de los índices parciales: mensajes no
// borrados y sin media. Debe coincidir con el WHERE de los índices para que el
// planner los use.
const searchVisibleText = "deleted_at IS NULL AND COALESCE(media_type,'') = ''"

// directVisibility replica el predicado de visibilidad de GetMessagesPage para
// todos los chats del usuario (los borrados para mí quedan excluidos).
const directVisibility = "((id_user = ? AND deleted_by_sender = false) OR (id_receptor = ? AND deleted_by_receiver = false))"

const groupMembership = "group_id IN (SELECT group_id FROM group_members WHERE user_id = ? AND deleted_at IS NULL)"

// SearchMatchSQL devuelve la condición de coincidencia sobre la columna message
// con un único parámetro: el término ya escapado con utils.EscapeLike.
func SearchMatchSQL(useNorm bool) string {
	if useNorm {
		return `norm(message) LIKE '%' || norm(?) || '%' ESCAPE '\'`
	}
	return `message ILIKE '%' || ? || '%' ESCAPE '\'`
}

var (
	searchNormOnce sync.Once
	searchNormOK   bool
)

// useSearchNorm detecta una sola vez si norm() está disponible y lo registra.
func useSearchNorm(db *gorm.DB) bool {
	searchNormOnce.Do(func() {
		var out string
		err := db.Raw("SELECT norm('Á')").Scan(&out).Error
		searchNormOK = err == nil && out == "a"
		if searchNormOK {
			log.Println("[DB] Búsqueda de mensajes: pg_trgm + unaccent")
		} else {
			log.Printf("[DB] Búsqueda de mensajes: norm() no disponible (%v); se usa ILIKE sin ignorar acentos", err)
		}
	})
	return searchNormOK
}

// SearchMessages busca mensajes de texto en la conversación con contactID
// (más recientes primero). before > 0 pagina por id; hasMore indica que hay
// más coincidencias más antiguas.
func (app *ApiContact) SearchMessages(userID, contactID uint, q string, before uint, limit int, ctx context.Context) ([]models.SearchRow, bool, error) {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if limit <= 0 {
		limit = 20
	}
	db := app.data.WithContext(c).Table("messages").
		Select(`id, "time", message`).
		Where(searchVisibleText).
		Where("((id_user = ? AND id_receptor = ? AND deleted_by_sender = ?) OR (id_user = ? AND id_receptor = ? AND deleted_by_receiver = ?))", userID, contactID, false, contactID, userID, false).
		Where(SearchMatchSQL(useSearchNorm(app.data)), utils.EscapeLike(q))
	if before > 0 {
		db = db.Where("id < ?", before)
	}
	var rows []models.SearchRow
	if err := db.Order("id DESC").Limit(limit + 1).Scan(&rows).Error; err != nil {
		return nil, false, err
	}
	hasMore := len(rows) > limit
	if hasMore {
		rows = rows[:limit]
	}
	return rows, hasMore, nil
}

// SearchGroupMessages busca mensajes de texto en un grupo. Solo devuelve
// resultados si userID es miembro activo (comprobado también en la consulta).
func (r *RepoGroup) SearchGroupMessages(groupID, userID uint, q string, before uint, limit int, ctx context.Context) ([]models.SearchRow, bool, error) {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if limit <= 0 {
		limit = 20
	}
	db := r.data.WithContext(c).Table("group_messages").
		Select(`id, "time", message`).
		Where(searchVisibleText).
		Where("group_id = ?", groupID).
		Where("EXISTS (SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ? AND deleted_at IS NULL)", groupID, userID).
		Where(SearchMatchSQL(useSearchNorm(r.data)), utils.EscapeLike(q))
	if before > 0 {
		db = db.Where("id < ?", before)
	}
	var rows []models.SearchRow
	if err := db.Order("id DESC").Limit(limit + 1).Scan(&rows).Error; err != nil {
		return nil, false, err
	}
	hasMore := len(rows) > limit
	if hasMore {
		rows = rows[:limit]
	}
	return rows, hasMore, nil
}

// globalSearchSQL agrupa las coincidencias por chat: se queda con los maxChats
// chats más recientes y, en cada uno, con hasta perChat mensajes; total es el
// número de coincidencias del chat. %CHAT%, %VISIBLE% y %FROM% se sustituyen por
// constantes internas (nunca por entrada del usuario).
const globalSearchSQL = `
WITH hits AS (
	SELECT id, "time", message, %CHAT% AS chat_id
	FROM %FROM%
	WHERE ` + searchVisibleText + ` AND %VISIBLE% AND %MATCH%
), chats AS (
	SELECT chat_id, count(*) AS total, max(id) AS latest
	FROM hits GROUP BY chat_id ORDER BY max(id) DESC LIMIT ?
), ranked AS (
	SELECT h.id, h."time", h.message, h.chat_id, c.total, c.latest,
		row_number() OVER (PARTITION BY h.chat_id ORDER BY h.id DESC) AS rn
	FROM hits h JOIN chats c ON c.chat_id = h.chat_id
)
SELECT id, "time", message, chat_id, total FROM ranked WHERE rn <= ? ORDER BY latest DESC, id DESC`

func buildGlobalSearchSQL(from, chat, visible string, useNorm bool) string {
	repl := map[string]string{"%CHAT%": chat, "%VISIBLE%": visible, "%FROM%": from, "%MATCH%": SearchMatchSQL(useNorm)}
	out := globalSearchSQL
	for k, v := range repl {
		out = strings.ReplaceAll(out, k, v)
	}
	return out
}

// SearchMessagesGlobal busca en todos los chats 1:1 visibles para el usuario.
// ChatID es el id del otro usuario.
func (app *ApiContact) SearchMessagesGlobal(userID uint, q string, perChat, maxChats int, ctx context.Context) ([]models.GlobalSearchRow, error) {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	sql := buildGlobalSearchSQL("messages", "CASE WHEN id_user = "+"?"+" THEN id_receptor ELSE id_user END", directVisibility, useSearchNorm(app.data))
	var rows []models.GlobalSearchRow
	// Orden de parámetros: CASE, visibilidad x2, término, maxChats, perChat.
	err := app.data.WithContext(c).Raw(sql, userID, userID, userID, utils.EscapeLike(q), maxChats, perChat).Scan(&rows).Error
	return rows, err
}

// SearchGroupMessagesGlobal busca en todos los grupos donde el usuario es
// miembro activo. ChatID es el id del grupo.
func (r *RepoGroup) SearchGroupMessagesGlobal(userID uint, q string, perChat, maxChats int, ctx context.Context) ([]models.GlobalSearchRow, error) {
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	sql := buildGlobalSearchSQL("group_messages", "group_id", groupMembership, useSearchNorm(r.data))
	var rows []models.GlobalSearchRow
	err := r.data.WithContext(c).Raw(sql, userID, utils.EscapeLike(q), maxChats, perChat).Scan(&rows).Error
	return rows, err
}
