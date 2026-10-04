package schemas

import "time"

// SearchResult es una coincidencia de la búsqueda de mensajes. Highlights son
// rangos [inicio, fin) en índices de rune sobre Snippet.
type SearchResult struct {
	MessageID  uint      `json:"messageID"`
	Time       time.Time `json:"time"`
	Snippet    string    `json:"snippet"`
	Highlights [][2]int  `json:"highlights"`
}

// SearchPage es una página de coincidencias (más recientes primero).
type SearchPage struct {
	Results []SearchResult `json:"results"`
	HasMore bool           `json:"hasMore"`
}

// GlobalSearchChat agrupa las coincidencias de un chat en la búsqueda global.
// Kind es "direct" (Key = telephon del contacto) o "group" (Key = id del grupo).
type GlobalSearchChat struct {
	Kind      string         `json:"kind"`
	Key       string         `json:"key"`
	Name      string         `json:"name"`
	AvatarUrl string         `json:"avatarUrl"`
	Results   []SearchResult `json:"results"`
	Total     int            `json:"total"`
}

// GlobalSearchResponse es la respuesta de GET /api/v1/search.
type GlobalSearchResponse struct {
	Chats []GlobalSearchChat `json:"chats"`
}
