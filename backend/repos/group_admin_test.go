package repos

import (
	"reflect"
	"testing"
	"time"

	"gorm/backend/models"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// ─────────────────────────────────────────────────────────────────────────────
// Promoción del último admin: desempate determinista
// ─────────────────────────────────────────────────────────────────────────────

// TestPromotionCandidate verifica que, cuando el grupo queda sin admins, el
// candidato sea el miembro activo más antiguo y, en empate de created_at, el de
// menor id (determinista para grupos migrados/importados).
func TestPromotionCandidate(t *testing.T) {
	base := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	older := base.Add(-time.Hour)
	newer := base.Add(time.Hour)

	member := func(id uint, createdAt time.Time) models.GroupMember {
		return models.GroupMember{Model: gorm.Model{ID: id, CreatedAt: createdAt}}
	}

	cases := []struct {
		name    string
		members []models.GroupMember
		wantID  uint
	}{
		{"sin miembros no hay candidato", nil, 0},
		{"un solo miembro", []models.GroupMember{member(9, base)}, 9},
		{"gana el más antiguo", []models.GroupMember{
			member(2, base),
			member(7, older),
			member(5, newer),
		}, 7},
		{"empate de fecha desempata por id ascendente (independiente del orden)", []models.GroupMember{
			member(9, base),
			member(3, base),
			member(6, base),
		}, 3},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := promotionCandidate(tc.members)
			if tc.wantID == 0 {
				assert.Nil(t, got)
				return
			}
			require.NotNil(t, got)
			assert.Equal(t, tc.wantID, got.ID)
		})
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Defaults de la configuración de grupo
// ─────────────────────────────────────────────────────────────────────────────

// TestGroupSettingsDefaults verifica que un grupo recién construido tiene las
// tres restricciones apagadas: el comportamiento actual no cambia para grupos
// existentes hasta que un admin active una configuración.
func TestGroupSettingsDefaults(t *testing.T) {
	g := models.Group{}
	assert.False(t, g.OnlyAdminsCanSend)
	assert.False(t, g.OnlyAdminsCanEditInfo)
	assert.False(t, g.OnlyAdminsCanAddMembers)
}

// TestGroupSettingsGormDefaults verifica que las columnas nuevas se mapean con
// default:false (AutoMigrate las añade apagadas a las filas existentes).
func TestGroupSettingsGormDefaults(t *testing.T) {
	typ := reflect.TypeOf(models.Group{})
	for _, name := range []string{"OnlyAdminsCanSend", "OnlyAdminsCanEditInfo", "OnlyAdminsCanAddMembers"} {
		field, ok := typ.FieldByName(name)
		require.True(t, ok, "campo %s presente en models.Group", name)
		assert.Equal(t, reflect.Bool, field.Type.Kind(), "%s debe ser bool", name)
		assert.Contains(t, field.Tag.Get("gorm"), "default:false", "%s debe tener default:false", name)
	}
}
