package utils

import (
	"strings"
	"unicode"

	"golang.org/x/text/unicode/norm"
)

// EscapeLike escapa los comodines de LIKE (`\`, `%`, `_`) para que la búsqueda
// sea literal. Debe usarse junto a `ESCAPE '\'` en la consulta.
func EscapeLike(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s {
		if r == '\\' || r == '%' || r == '_' {
			b.WriteRune('\\')
		}
		b.WriteRune(r)
	}
	return b.String()
}

// foldRune pasa a minúscula y quita el acento de un rune, siempre devolviendo
// exactamente un rune (los offsets del texto original se conservan).
func foldRune(r rune) rune {
	r = unicode.ToLower(r)
	if r < 0x80 {
		return r
	}
	for _, d := range norm.NFD.String(string(r)) {
		if !unicode.Is(unicode.Mn, d) {
			return d
		}
	}
	return r
}

// Fold devuelve el texto plegado (minúsculas, sin acentos) rune a rune, de modo
// que Fold(s)[i] corresponde al rune i de s.
func Fold(s string) []rune {
	out := make([]rune, 0, len(s))
	for _, r := range s {
		out = append(out, foldRune(r))
	}
	return out
}

// indexRunes devuelve el índice de la primera aparición de sub en s desde from, o -1.
func indexRunes(s, sub []rune, from int) int {
	if len(sub) == 0 {
		return -1
	}
	for i := from; i+len(sub) <= len(s); i++ {
		match := true
		for j := range sub {
			if s[i+j] != sub[j] {
				match = false
				break
			}
		}
		if match {
			return i
		}
	}
	return -1
}

const snippetEllipsis = '…'

// BuildSnippet devuelve un fragmento de ~maxRunes runes alrededor de la primera
// coincidencia de query en text (sin distinguir mayúsculas ni acentos) y los
// rangos [inicio, fin) de todas las coincidencias dentro del fragmento, en
// índices de rune. Si el fragmento se recorta se añade "…" al inicio/final y
// los rangos ya lo tienen en cuenta. Sin coincidencia devuelve el inicio del
// texto sin resaltados.
func BuildSnippet(text, query string, maxRunes int) (string, [][2]int) {
	runes := []rune(text)
	qf := Fold(strings.TrimSpace(query))
	tf := Fold(text)
	first := indexRunes(tf, qf, 0)

	window := maxRunes
	if len(qf) > window {
		window = len(qf)
	}
	start, end := 0, len(runes)
	if len(runes) > window {
		if first > 0 {
			start = first - (window-len(qf))/2
		}
		if start < 0 {
			start = 0
		}
		end = start + window
		if end > len(runes) {
			end = len(runes)
			start = end - window
		}
	}

	prefix := 0
	var b strings.Builder
	if start > 0 {
		b.WriteRune(snippetEllipsis)
		prefix = 1
	}
	b.WriteString(string(runes[start:end]))
	if end < len(runes) {
		b.WriteRune(snippetEllipsis)
	}

	var highlights [][2]int
	for pos := start; first >= 0; {
		i := indexRunes(tf[:end], qf, pos)
		if i < 0 {
			break
		}
		highlights = append(highlights, [2]int{i - start + prefix, i - start + prefix + len(qf)})
		pos = i + len(qf)
	}
	return b.String(), highlights
}
