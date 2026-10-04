package services

import (
	"context"
	"errors"
	"gorm/backend/models"
	"gorm/backend/schemas"
	"gorm/backend/utils"
	"sort"
	"strconv"
	"strings"
	"unicode/utf8"
)

const (
	searchMinQueryLen = 2
	searchMaxQueryLen = 100
	searchSnippetLen  = 80 // runes alrededor de la primera coincidencia

	searchDefaultLimit = 20 // resultados por página en la búsqueda dentro de un chat
	searchMaxLimit     = 50

	searchGlobalDefaultPerChat = 3
	searchGlobalMaxPerChat     = 10
	searchGlobalDefaultChats   = 20
	searchGlobalMaxChats       = 50
)

// ErrInvalidSearchQuery indica un término de búsqueda fuera de 2–100 caracteres.
var ErrInvalidSearchQuery = errors.New("la búsqueda debe tener entre 2 y 100 caracteres")

// NormalizeSearchQuery recorta el término y valida su longitud (en caracteres).
func NormalizeSearchQuery(q string) (string, error) {
	q = strings.TrimSpace(q)
	n := utf8.RuneCountInString(q)
	if n < searchMinQueryLen || n > searchMaxQueryLen {
		return "", ErrInvalidSearchQuery
	}
	return q, nil
}

func clampSearchLimit(limit int) int {
	if limit <= 0 {
		return searchDefaultLimit
	}
	if limit > searchMaxLimit {
		return searchMaxLimit
	}
	return limit
}

func toSearchResult(row models.SearchRow, q string) schemas.SearchResult {
	snippet, highlights := utils.BuildSnippet(row.Message, q, searchSnippetLen)
	if highlights == nil {
		highlights = [][2]int{}
	}
	return schemas.SearchResult{MessageID: row.ID, Time: row.Time, Snippet: snippet, Highlights: highlights}
}

func buildSearchPage(rows []models.SearchRow, hasMore bool, q string) *schemas.SearchPage {
	results := make([]schemas.SearchResult, 0, len(rows))
	for _, row := range rows {
		results = append(results, toSearchResult(row, q))
	}
	return &schemas.SearchPage{Results: results, HasMore: hasMore}
}

// ServiceSearchMessages busca mensajes de texto en la conversación con
// telephonContact (más recientes primero, paginado con before).
func (rp *ServiceChat) ServiceSearchMessages(telephonUser, telephonContact, q string, before uint, limit int, ctx context.Context) (*schemas.SearchPage, error) {
	q, err := NormalizeSearchQuery(q)
	if err != nil {
		return nil, err
	}
	idUser, err := rp.repo.GetIdByTelephon(telephonUser, ctx)
	if err != nil {
		return nil, err
	}
	idContact, err := rp.repo.GetIdByTelephon(telephonContact, ctx)
	if err != nil {
		return nil, err
	}
	rows, hasMore, err := rp.repo.SearchMessages(uint(idUser), uint(idContact), q, before, clampSearchLimit(limit), ctx)
	if err != nil {
		return nil, err
	}
	return buildSearchPage(rows, hasMore, q), nil
}

// SearchGroupMessages busca mensajes de texto en un grupo. Solo miembros
// activos (ErrNotGroupMember en otro caso).
func (s *ServiceGroup) SearchGroupMessages(telephon string, groupID uint, q string, before uint, limit int, ctx context.Context) (*schemas.SearchPage, error) {
	q, err := NormalizeSearchQuery(q)
	if err != nil {
		return nil, err
	}
	userID, err := s.contactRepo.GetIdByTelephon(telephon, ctx)
	if err != nil {
		return nil, errors.New("usuario no encontrado")
	}
	isMember, err := s.repo.IsMember(groupID, uint(userID), ctx)
	if err != nil {
		return nil, err
	}
	if !isMember {
		return nil, ErrNotGroupMember
	}
	rows, hasMore, err := s.repo.SearchGroupMessages(groupID, uint(userID), q, before, clampSearchLimit(limit), ctx)
	if err != nil {
		return nil, err
	}
	return buildSearchPage(rows, hasMore, q), nil
}

// ─────────────────────────────────────────────────────────────────────────────
// Búsqueda global
// ─────────────────────────────────────────────────────────────────────────────

// SearchServicer es la búsqueda de mensajes en todos los chats del usuario.
type SearchServicer interface {
	SearchAll(telephon, q string, perChat, maxChats int, ctx context.Context) (*schemas.GlobalSearchResponse, error)
}

// SearchChatRepoInterface son las consultas de chats 1:1 que necesita la búsqueda global.
type SearchChatRepoInterface interface {
	GetIdByTelephon(telephon string, ctx context.Context) (int, error)
	SearchMessagesGlobal(userID uint, q string, perChat, maxChats int, ctx context.Context) ([]models.GlobalSearchRow, error)
	GetAddedContactIDs(userID uint, ctx context.Context) (map[uint]string, error)
	GetUsersBasicByIDs(ids []uint, ctx context.Context) (map[uint]models.UserBasic, error)
}

// SearchGroupRepoInterface son las consultas de grupos que necesita la búsqueda global.
type SearchGroupRepoInterface interface {
	SearchGroupMessagesGlobal(userID uint, q string, perChat, maxChats int, ctx context.Context) ([]models.GlobalSearchRow, error)
	GetUserGroups(userID uint, ctx context.Context) ([]models.UserGroupRow, error)
}

type ServiceSearch struct {
	chatRepo  SearchChatRepoInterface
	groupRepo SearchGroupRepoInterface
}

// InitServiceSearch crea el servicio de búsqueda global.
func InitServiceSearch(chatRepo SearchChatRepoInterface, groupRepo SearchGroupRepoInterface) SearchServicer {
	return &ServiceSearch{chatRepo: chatRepo, groupRepo: groupRepo}
}

func clampRange(v, def, max int) int {
	if v <= 0 {
		return def
	}
	if v > max {
		return max
	}
	return v
}

// groupSearchRows agrupa filas consecutivas del mismo chat conservando el orden.
func groupSearchRows(rows []models.GlobalSearchRow) (order []uint, byChat map[uint][]models.GlobalSearchRow) {
	byChat = make(map[uint][]models.GlobalSearchRow)
	for _, r := range rows {
		if _, seen := byChat[r.ChatID]; !seen {
			order = append(order, r.ChatID)
		}
		byChat[r.ChatID] = append(byChat[r.ChatID], r)
	}
	return order, byChat
}

func globalResults(rows []models.GlobalSearchRow, q string) []schemas.SearchResult {
	out := make([]schemas.SearchResult, 0, len(rows))
	for _, r := range rows {
		out = append(out, toSearchResult(models.SearchRow{ID: r.ID, Time: r.Time, Message: r.Message}, q))
	}
	return out
}

// SearchAll devuelve las coincidencias agrupadas por chat (1:1 y grupos),
// con perChat resultados como máximo por chat y maxChats chats en total,
// ordenados por la coincidencia más reciente.
func (s *ServiceSearch) SearchAll(telephon, q string, perChat, maxChats int, ctx context.Context) (*schemas.GlobalSearchResponse, error) {
	q, err := NormalizeSearchQuery(q)
	if err != nil {
		return nil, err
	}
	perChat = clampRange(perChat, searchGlobalDefaultPerChat, searchGlobalMaxPerChat)
	maxChats = clampRange(maxChats, searchGlobalDefaultChats, searchGlobalMaxChats)

	id, err := s.chatRepo.GetIdByTelephon(telephon, ctx)
	if err != nil {
		return nil, errors.New("usuario no encontrado")
	}
	userID := uint(id)

	directRows, err := s.chatRepo.SearchMessagesGlobal(userID, q, perChat, maxChats, ctx)
	if err != nil {
		return nil, err
	}
	groupRows, err := s.groupRepo.SearchGroupMessagesGlobal(userID, q, perChat, maxChats, ctx)
	if err != nil {
		return nil, err
	}

	chats := make([]schemas.GlobalSearchChat, 0)

	if len(directRows) > 0 {
		order, byChat := groupSearchRows(directRows)
		contacts, err := s.chatRepo.GetAddedContactIDs(userID, ctx)
		if err != nil {
			return nil, err
		}
		users, err := s.chatRepo.GetUsersBasicByIDs(order, ctx)
		if err != nil {
			return nil, err
		}
		for _, peerID := range order {
			u, ok := users[peerID]
			if !ok {
				continue
			}
			name := contacts[peerID]
			if name == "" {
				name = u.Username
			}
			if name == "" {
				name = u.Telephon
			}
			rows := byChat[peerID]
			chats = append(chats, schemas.GlobalSearchChat{
				Kind: "direct", Key: u.Telephon, Name: name, AvatarUrl: u.AvatarUrl,
				Results: globalResults(rows, q), Total: rows[0].Total,
			})
		}
	}

	if len(groupRows) > 0 {
		order, byChat := groupSearchRows(groupRows)
		groups, err := s.groupRepo.GetUserGroups(userID, ctx)
		if err != nil {
			return nil, err
		}
		names := make(map[uint]models.Group, len(groups))
		for _, g := range groups {
			names[g.ID] = g.Group
		}
		for _, groupID := range order {
			g, ok := names[groupID]
			if !ok {
				continue
			}
			rows := byChat[groupID]
			chats = append(chats, schemas.GlobalSearchChat{
				Kind: "group", Key: strconv.FormatUint(uint64(groupID), 10), Name: g.Name, AvatarUrl: g.AvatarUrl,
				Results: globalResults(rows, q), Total: rows[0].Total,
			})
		}
	}

	// Chats con la coincidencia más reciente primero (los ids de 1:1 y grupos
	// no son comparables entre sí; el instante del mensaje sí).
	sort.SliceStable(chats, func(i, j int) bool {
		return chats[i].Results[0].Time.After(chats[j].Results[0].Time)
	})
	if len(chats) > maxChats {
		chats = chats[:maxChats]
	}
	return &schemas.GlobalSearchResponse{Chats: chats}, nil
}
