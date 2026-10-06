package models

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// RF7: the old tests only re-asserted the constants and the struct tags, so they
// proved no contract. These assert the observable behavior the API relies on:
// the camelCase JSON shape (api-casing contract) and that internal columns never
// leak to a client.

// Un sticker propio expone id/url/sha256/animated/favorite/tags/createdAt y
// nunca filtra las columnas internas (id_user, tags crudo, deleted_at).
func TestUserStickerJSONContract(t *testing.T) {
	raw, err := json.Marshal(UserSticker{ID: 7, IdUser: 42, SHA256: "abc", URL: "/u", Animated: true, Tags: "hola,mundo", Favorite: true})
	require.NoError(t, err)

	var body map[string]any
	require.NoError(t, json.Unmarshal(raw, &body))

	for _, key := range []string{"id", "url", "sha256", "animated", "favorite", "createdAt"} {
		assert.Contains(t, body, key, "la API usa camelCase")
	}
	for _, leaked := range []string{"IdUser", "id_user", "Tags", "DeletedAt", "deleted_at"} {
		assert.NotContains(t, body, leaked, "una columna interna no debe salir al cliente")
	}
	assert.Equal(t, true, body["animated"])
	assert.Equal(t, true, body["favorite"])
}

// La respuesta compuesta usa las claves mine/favorites/recents y las filas
// llevan url/createdAt/lastUsedAt (mismo contrato camelCase).
func TestStickerLibraryResponseJSONContract(t *testing.T) {
	raw, err := json.Marshal(StickerLibraryResponse{
		Mine:      []StickerResponse{{ID: 1, URL: "/storage/media/stickers/a.webp", SHA256: "s", Tags: []string{"hola"}}},
		Favorites: []StickerFavoriteItem{{URL: "/stickers/basic/hola.webp"}},
		Recents:   []StickerRecentItem{{URL: "/stickers/basic/hola.webp"}},
	})
	require.NoError(t, err)

	var body map[string]any
	require.NoError(t, json.Unmarshal(raw, &body))
	for _, key := range []string{"mine", "favorites", "recents"} {
		assert.Contains(t, body, key)
	}

	mine := body["mine"].([]any)[0].(map[string]any)
	assert.Contains(t, mine, "tags", "las etiquetas salen como arreglo")
	fav := body["favorites"].([]any)[0].(map[string]any)
	assert.Contains(t, fav, "url")
	assert.Contains(t, fav, "createdAt")
	recent := body["recents"].([]any)[0].(map[string]any)
	assert.Contains(t, recent, "url")
	assert.Contains(t, recent, "lastUsedAt")
}

// Los cuerpos de entrada hacen round-trip con las claves que envía el cliente.
func TestStickerInputsRoundTrip(t *testing.T) {
	var save StickerSaveInput
	require.NoError(t, json.Unmarshal([]byte(`{"url":"/storage/media/stickers/a.webp"}`), &save))
	assert.Equal(t, "/storage/media/stickers/a.webp", save.URL)

	var fav StickerFavoriteInput
	require.NoError(t, json.Unmarshal([]byte(`{"url":"/stickers/basic/hola.webp","favorite":true}`), &fav))
	assert.Equal(t, "/stickers/basic/hola.webp", fav.URL)
	assert.True(t, fav.Favorite)
}
