package models

import "time"

// SearchRow es un mensaje de texto que coincide con una búsqueda (sin procesar).
type SearchRow struct {
	ID      uint
	Time    time.Time
	Message string
}

// GlobalSearchRow es una coincidencia de la búsqueda global junto con el chat
// al que pertenece (id del contacto en 1:1, id del grupo en grupos) y el total
// de coincidencias de ese chat.
type GlobalSearchRow struct {
	ID      uint
	Time    time.Time
	Message string
	ChatID  uint
	Total   int
}
