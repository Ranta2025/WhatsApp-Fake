package utils

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestEscapeLike(t *testing.T) {
	assert.Equal(t, `50\%\_a\\b`, EscapeLike(`50%_a\b`))
	assert.Equal(t, "hola", EscapeLike("hola"))
	assert.Equal(t, "", EscapeLike(""))
}

func TestFoldIsRuneForRune(t *testing.T) {
	in := "CANCIÓN Ñandú 😀 ÀÉÎõü"
	folded := Fold(in)
	assert.Equal(t, len([]rune(in)), len(folded))
	assert.Equal(t, "cancion nandu 😀 aeiou", string(folded))
}

func TestBuildSnippetShortTextAccentAndCaseInsensitive(t *testing.T) {
	snip, hl := BuildSnippet("Hola CANCIÓN mía", "cancion", 80)
	assert.Equal(t, "Hola CANCIÓN mía", snip)
	assert.Equal(t, [][2]int{{5, 12}}, hl)
}

func TestBuildSnippetQueryWithAccentMatchesPlainText(t *testing.T) {
	snip, hl := BuildSnippet("una cancion", "canción", 80)
	assert.Equal(t, "una cancion", snip)
	assert.Equal(t, [][2]int{{4, 11}}, hl)
}

func TestBuildSnippetMultipleNonOverlapping(t *testing.T) {
	_, hl := BuildSnippet("ana banana", "an", 80)
	assert.Equal(t, [][2]int{{0, 2}, {5, 7}, {7, 9}}, hl)
	_, hl = BuildSnippet("aaaa", "aa", 80)
	assert.Equal(t, [][2]int{{0, 2}, {2, 4}}, hl)
}

func TestBuildSnippetWildcardsAreLiteral(t *testing.T) {
	snip, hl := BuildSnippet("descuento 50% hoy", "50%", 80)
	assert.Equal(t, "descuento 50% hoy", snip)
	assert.Equal(t, [][2]int{{10, 13}}, hl)
}

func TestBuildSnippetRuneIndicesWithMultibyte(t *testing.T) {
	snip, hl := BuildSnippet("😀😀 canción", "cancion", 80)
	assert.Equal(t, "😀😀 canción", snip)
	assert.Equal(t, [][2]int{{3, 10}}, hl)
}

func TestBuildSnippetLongTextWindowsAroundFirstHit(t *testing.T) {
	text := strings.Repeat("x", 200) + " canción " + strings.Repeat("y", 200)
	snip, hl := BuildSnippet(text, "cancion", 80)
	runes := []rune(snip)
	assert.LessOrEqual(t, len(runes), 82)
	assert.Equal(t, '…', runes[0])
	assert.Equal(t, '…', runes[len(runes)-1])
	require.Len(t, hl, 1)
	assert.Equal(t, "canción", string(runes[hl[0][0]:hl[0][1]]))
}

func TestBuildSnippetHitNearStartHasNoLeadingEllipsis(t *testing.T) {
	text := "canción " + strings.Repeat("y", 300)
	snip, hl := BuildSnippet(text, "cancion", 80)
	runes := []rune(snip)
	assert.NotEqual(t, '…', runes[0])
	assert.Equal(t, '…', runes[len(runes)-1])
	assert.Equal(t, [][2]int{{0, 7}}, hl)
}

func TestBuildSnippetNoMatchReturnsHeadWithoutHighlights(t *testing.T) {
	snip, hl := BuildSnippet("hola mundo", "zzz", 80)
	assert.Equal(t, "hola mundo", snip)
	assert.Empty(t, hl)
}

func TestBuildSnippetEmptyQuery(t *testing.T) {
	snip, hl := BuildSnippet("hola", "", 80)
	assert.Equal(t, "hola", snip)
	assert.Empty(t, hl)
}
