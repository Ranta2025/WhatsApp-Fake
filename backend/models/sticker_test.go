package models

import (
	"reflect"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestStickerLibraryLimits(t *testing.T) {
	assert.Equal(t, 200, MaxUserStickers)
	assert.Equal(t, 100, MaxStickerFavorites)
	assert.Equal(t, 30, StickerRecentsMax)
	assert.Equal(t, 5, StickerTagsMax)
	assert.Equal(t, 20, StickerTagMaxLen)
}

// El dueño sigue el patrón de messages.id_user: columna id_user con índice.
// La unicidad (owner, sha256) es un índice parcial (deleted_at IS NULL) creado
// por execMigration, por eso el modelo NO lleva uniqueIndex: si lo llevara,
// AutoMigrate crearía un índice único total y un re-upload tras borrar fallaría.
func TestUserStickerOwnerAndUniqueIndexShape(t *testing.T) {
	typ := reflect.TypeOf(UserSticker{})
	idUser, ok := typ.FieldByName("IdUser")
	require.True(t, ok)
	assert.Contains(t, idUser.Tag.Get("gorm"), "index")

	sha, ok := typ.FieldByName("SHA256")
	require.True(t, ok)
	assert.Contains(t, sha.Tag.Get("gorm"), "column:sha256")
	assert.NotContains(t, sha.Tag.Get("gorm"), "uniqueIndex")

	deleted, ok := typ.FieldByName("DeletedAt")
	require.True(t, ok)
	assert.Equal(t, reflect.TypeOf(gorm.DeletedAt{}), deleted.Type)
}
