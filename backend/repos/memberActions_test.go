package repos

import (
	"sync"
	"testing"

	"gorm/backend/models"

	"github.com/stretchr/testify/assert"
)

// ─────────────────────────────────────────────────────────────────────────────
// Decisión pura de la re-verificación bajo lock de grupo
// ─────────────────────────────────────────────────────────────────────────────

// TestMembershipDecision fija las invariantes de una mutación de membresía tal
// como se re-verifican DENTRO de la transacción (bajo lockGroupRow):
//   - actor activo y admin
//   - objetivo activo
//   - actor != objetivo (no auto-descarte / auto-remoción)
//   - en cambio de rol, el rol nuevo debe diferir del actual (no-op rechazado)
func TestMembershipDecision(t *testing.T) {
	const (
		actor  = uint(1)
		target = uint(2)
	)

	cases := []struct {
		name         string
		actorID      uint
		targetID     uint
		actorRole    string
		actorActive  bool
		targetRole   string
		targetActive bool
		newRole      string
		roleChange   bool
		wantErr      error
	}{
		{"actor inactivo no puede mutar", actor, target, "", false, "member", true, "admin", true, models.ErrNotGroupMember},
		{"actor miembro no puede mutar", actor, target, "member", true, "member", true, "admin", true, models.ErrNotGroupAdmin},
		{"objetivo inactivo no es miembro", actor, target, "admin", true, "", false, "member", true, models.ErrGroupTargetNotMember},
		{"no auto-descarte", actor, actor, "admin", true, "admin", true, "member", true, models.ErrInvalidRoleChange},
		{"no auto-remoción", actor, actor, "admin", true, "admin", true, "", false, models.ErrInvalidRoleChange},
		{"member->member es no-op", actor, target, "admin", true, "member", true, "member", true, models.ErrInvalidRoleChange},
		{"admin->admin es no-op", actor, target, "admin", true, "admin", true, "admin", true, models.ErrInvalidRoleChange},
		{"promover member es válido", actor, target, "admin", true, "member", true, "admin", true, nil},
		{"degradar admin es válido", actor, target, "admin", true, "admin", true, "member", true, nil},
		{"remover member es válido", actor, target, "admin", true, "member", true, "", false, nil},
		{"remover admin es válido", actor, target, "admin", true, "admin", true, "", false, nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := membershipDecision(tc.actorID, tc.targetID, tc.actorRole, tc.actorActive, tc.targetRole, tc.targetActive, tc.newRole, tc.roleChange)
			if tc.wantErr == nil {
				assert.NoError(t, err)
			} else {
				assert.ErrorIs(t, err, tc.wantErr)
			}
		})
	}
}

// TestConcurrentMutualDismissalKeepsOneAdmin reproduce la carrera real: dos
// admins se descartan mutuamente. El lock de fila de grupo (modelado aquí con
// un mutex sobre el estado) serializa las transacciones; la re-verificación del
// actor dentro de la sección crítica impide que el grupo quede sin admins.
func TestConcurrentMutualDismissalKeepsOneAdmin(t *testing.T) {
	roles := map[uint]string{
		1: models.GroupRoleAdmin,
		2: models.GroupRoleAdmin,
	}
	var mu sync.Mutex
	var wg sync.WaitGroup
	results := make(chan error, 2)

	dismiss := func(actorID, targetID uint) {
		defer wg.Done()
		mu.Lock()
		defer mu.Unlock()

		actorRole, actorActive := roles[actorID]
		targetRole, targetActive := roles[targetID]
		err := membershipDecision(actorID, targetID, actorRole, actorActive, targetRole, targetActive, models.GroupRoleMember, true)
		if err == nil {
			roles[targetID] = models.GroupRoleMember
		}
		results <- err
	}

	wg.Add(2)
	go dismiss(1, 2)
	go dismiss(2, 1)
	wg.Wait()
	close(results)

	succeeded, failed := 0, 0
	for err := range results {
		if err == nil {
			succeeded++
		} else {
			failed++
		}
	}
	assert.Equal(t, 1, succeeded, "solo una mutación puede pasar")
	assert.Equal(t, 1, failed, "la segunda re-verifica al actor ya degradado")

	admins := 0
	for _, role := range roles {
		if role == models.GroupRoleAdmin {
			admins++
		}
	}
	assert.GreaterOrEqual(t, admins, 1, "el grupo nunca queda sin admins")
}

// ─────────────────────────────────────────────────────────────────────────────
// Idempotencia del PATCH de configuración
// ─────────────────────────────────────────────────────────────────────────────

// TestSettingsUpdates fija la idempotencia: solo se persisten los campos
// presentes que REALMENTE cambian. Un PATCH que repite los valores vigentes
// devuelve un mapa vacío, de modo que no se escribe ni se emite system message.
func TestSettingsUpdates(t *testing.T) {
	boolPtr := func(v bool) *bool { return &v }

	current := models.Group{
		OnlyAdminsCanSend:       true,
		OnlyAdminsCanEditInfo:   false,
		OnlyAdminsCanAddMembers: true,
	}

	cases := []struct {
		name      string
		patch     models.GroupSettingsUpdate
		wantKeys  []string
		wantEmpty bool
	}{
		{"campo ausente no cambia nada", models.GroupSettingsUpdate{}, nil, true},
		{"mismo valor no cambia nada", models.GroupSettingsUpdate{OnlyAdminsCanSend: boolPtr(true)}, nil, true},
		{"los tres iguales no cambian nada", models.GroupSettingsUpdate{
			OnlyAdminsCanSend: boolPtr(true), OnlyAdminsCanEditInfo: boolPtr(false), OnlyAdminsCanAddMembers: boolPtr(true),
		}, nil, true},
		{"un cambio real se persiste", models.GroupSettingsUpdate{OnlyAdminsCanSend: boolPtr(false)}, []string{"only_admins_can_send"}, false},
		{"cambios parciales solo incluyen los distintos", models.GroupSettingsUpdate{
			OnlyAdminsCanSend: boolPtr(true), OnlyAdminsCanEditInfo: boolPtr(true), OnlyAdminsCanAddMembers: boolPtr(true),
		}, []string{"only_admins_can_edit_info"}, false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			updates := settingsUpdates(current, tc.patch)
			if tc.wantEmpty {
				assert.Empty(t, updates)
				return
			}
			assert.Len(t, updates, len(tc.wantKeys))
			for _, k := range tc.wantKeys {
				assert.Contains(t, updates, k)
			}
		})
	}
}
