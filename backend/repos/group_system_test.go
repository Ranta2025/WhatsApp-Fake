package repos

import (
	"reflect"
	"testing"

	"gorm/backend/models"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ─────────────────────────────────────────────────────────────────────────────
// Modelo: campos y tags del mensaje de sistema
// ─────────────────────────────────────────────────────────────────────────────

// TestGroupMessageSystemGormTags fija la forma aditiva de las columnas nuevas:
// Kind arranca vacío (default ”) para que las filas existentes sigan siendo
// mensajes normales, y SystemTargets se serializa a JSON.
func TestGroupMessageSystemGormTags(t *testing.T) {
	typ := reflect.TypeOf(models.GroupMessage{})

	kind, ok := typ.FieldByName("Kind")
	require.True(t, ok, "models.GroupMessage debe tener Kind")
	assert.Equal(t, reflect.String, kind.Type.Kind())
	assert.Contains(t, kind.Tag.Get("gorm"), "default:''", "Kind arranca vacío")

	event, ok := typ.FieldByName("SystemEvent")
	require.True(t, ok, "models.GroupMessage debe tener SystemEvent")
	assert.Equal(t, reflect.String, event.Type.Kind())

	targets, ok := typ.FieldByName("SystemTargets")
	require.True(t, ok, "models.GroupMessage debe tener SystemTargets")
	assert.Equal(t, reflect.Slice, targets.Type.Kind())
	assert.Contains(t, targets.Tag.Get("gorm"), "serializer:json", "SystemTargets se persiste como JSON")
}

// TestNewSystemMessage verifica el constructor estructurado: SenderID = actor y
// los targets son teléfonos, no texto renderizado.
func TestNewSystemMessage(t *testing.T) {
	msg := models.NewSystemMessage(7, 42, models.SystemEventMemberLeft, []string{"+1"})

	require.NotNil(t, msg)
	assert.Equal(t, uint(7), msg.GroupID)
	assert.Equal(t, uint(42), msg.SenderID)
	assert.Equal(t, models.GroupMessageKindSystem, msg.Kind)
	assert.Equal(t, models.SystemEventMemberLeft, msg.SystemEvent)
	assert.Equal(t, []string{"+1"}, msg.SystemTargets)
	assert.False(t, msg.Time.IsZero())
}

// TestSystemTargetsFromMembers extrae los teléfonos de los miembros realmente
// insertados y descarta los que no traen usuario preload.
func TestSystemTargetsFromMembers(t *testing.T) {
	members := []models.GroupMember{
		{User: models.UserDataBase{User: models.User{Telephon: "+1"}}},
		{User: models.UserDataBase{User: models.User{Telephon: "+2"}}},
		{User: models.UserDataBase{}},
	}
	assert.Equal(t, []string{"+1", "+2"}, systemTargetsFromMembers(members))
}

// ─────────────────────────────────────────────────────────────────────────────
// Búsqueda: excluir los mensajes de sistema (grupo + global)
// ─────────────────────────────────────────────────────────────────────────────

// TestGroupSearchSQLExcludesSystemMessages comprueba que el SQL de búsqueda de
// grupo (global) filtra los mensajes de sistema y que la búsqueda 1:1 (tabla
// messages, sin columna kind) no lo hace.
func TestGroupSearchSQLExcludesSystemMessages(t *testing.T) {
	groupSQL := buildGlobalSearchSQL("group_messages", "group_id", groupSearchMembership, false)
	assert.Contains(t, groupSQL, systemMessageFilter)
	assert.Contains(t, groupSearchVisibleText, systemMessageFilter, "búsqueda de grupo no global también excluye system")

}

// TestDirectSearchSQLExcludesSystemMessages: la búsqueda 1:1 (global y por chat)
// también excluye los mensajes de sistema `disappearing_changed`.
func TestDirectSearchSQLExcludesSystemMessages(t *testing.T) {
	assert.Contains(t, directGlobalSearchSQL(false), systemMessageFilter)
	assert.Contains(t, directGlobalSearchSQL(true), systemMessageFilter)
	assert.Contains(t, directSearchVisibleText, systemMessageFilter)
	assert.Contains(t, directSearchVisibleText, searchVisibleText, "mantiene el predicado base de los índices parciales")
	// La visibilidad base (reacciones) no cambia; el filtro se añade aparte.
	assert.NotContains(t, directVisibility, "kind")
}
