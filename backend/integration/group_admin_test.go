//go:build integration

// Invariantes de administración de miembros a nivel de base de datos. Se
// ejecutan contra PostgreSQL real con: go test -tags integration ./backend/integration/
// (no se corre contra el stack compartido; cubre lo que los mocks no pueden:
// lockGroupRow, soft-delete + rejoin y la carrera de descarte mutuo).
package integration

import (
	"context"
	"sync"
	"testing"
	"time"

	"gorm/backend/models"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGroupAdminMemberManagement(t *testing.T) {
	db, _, groupRepo, _, _ := setup(t)
	ctx := context.Background()
	ana, luis, marta := createUser(t, db, 1), createUser(t, db, 2), createUser(t, db, 3)

	g := &models.Group{Name: "equipo", CreatorID: ana.ID}
	require.NoError(t, groupRepo.CreateGroupWithMembers(g, ana.ID, []uint{luis.ID, marta.ID}, ctx))

	t.Run("promover miembro a admin persiste el system message", func(t *testing.T) {
		sys := models.NewSystemMessage(g.ID, ana.ID, models.SystemEventAdminGranted, []string{luis.Telephon})
		require.NoError(t, groupRepo.ChangeMemberRole(g.ID, ana.ID, luis.ID, models.GroupRoleAdmin, sys, ctx))

		role, err := groupRepo.GetMemberRole(g.ID, luis.ID, ctx)
		require.NoError(t, err)
		assert.Equal(t, models.GroupRoleAdmin, role)
		assert.NotZero(t, sys.ID, "el mensaje de sistema se persistió en la transacción")
	})

	t.Run("degradar y no auto-descartarse", func(t *testing.T) {
		sys := models.NewSystemMessage(g.ID, ana.ID, models.SystemEventAdminRevoked, []string{luis.Telephon})
		require.NoError(t, groupRepo.ChangeMemberRole(g.ID, ana.ID, luis.ID, models.GroupRoleMember, sys, ctx))

		role, err := groupRepo.GetMemberRole(g.ID, luis.ID, ctx)
		require.NoError(t, err)
		assert.Equal(t, models.GroupRoleMember, role)

		// Ana no puede descartarse a sí misma.
		self := models.NewSystemMessage(g.ID, ana.ID, models.SystemEventAdminRevoked, []string{ana.Telephon})
		err = groupRepo.ChangeMemberRole(g.ID, ana.ID, ana.ID, models.GroupRoleMember, self, ctx)
		assert.ErrorIs(t, err, models.ErrInvalidRoleChange)
	})

	t.Run("remover, perder acceso y rejoin con baseline fresco", func(t *testing.T) {
		msg := &models.GroupMessage{GroupID: g.ID, SenderID: ana.ID, Message: "hola", Time: time.Now()}
		require.NoError(t, groupRepo.CreateGroupMessage(msg, ctx))

		sys := models.NewSystemMessage(g.ID, ana.ID, models.SystemEventMemberRemoved, []string{marta.Telephon})
		require.NoError(t, groupRepo.RemoveMember(g.ID, ana.ID, marta.ID, sys, ctx))

		// El removido ya no es miembro (pierde historial/búsqueda/acuses).
		_, err := groupRepo.GetMemberRole(g.ID, marta.ID, ctx)
		assert.Error(t, err)

		// Rejoin: nuevo miembro con joined_message_id fresco (>= max conocido).
		member := models.GroupMember{UserID: marta.ID, Role: models.GroupRoleMember, AddedByID: ana.ID}
		added, err := groupRepo.AddMembers(g.ID, []models.GroupMember{member}, nil, ctx)
		require.NoError(t, err)
		require.Len(t, added, 1)

		members, err := groupRepo.GetGroupMembers(g.ID, ctx)
		require.NoError(t, err)
		var rejoined models.GroupMember
		for _, m := range members {
			if m.UserID == marta.ID {
				rejoined = m
			}
		}
		assert.Equal(t, models.GroupRoleMember, rejoined.Role)
		assert.GreaterOrEqual(t, rejoined.JoinedMessageID, msg.ID, "baseline fresco cubre los mensajes previos al rejoin")
	})

	t.Run("descarte mutuo concurrente no deja cero admins", func(t *testing.T) {
		// Aseguramos dos admins: Ana (creadora) y Luis.
		require.NoError(t, groupRepo.ChangeMemberRole(g.ID, ana.ID, luis.ID, models.GroupRoleAdmin,
			models.NewSystemMessage(g.ID, ana.ID, models.SystemEventAdminGranted, []string{luis.Telephon}), ctx))

		var wg sync.WaitGroup
		errs := make([]error, 2)
		run := func(i int, actor, target uint, targetTel string) {
			defer wg.Done()
			sys := models.NewSystemMessage(g.ID, actor, models.SystemEventAdminRevoked, []string{targetTel})
			errs[i] = groupRepo.ChangeMemberRole(g.ID, actor, target, models.GroupRoleMember, sys, ctx)
		}
		wg.Add(2)
		go run(0, ana.ID, luis.ID, luis.Telephon)
		go run(1, luis.ID, ana.ID, ana.Telephon)
		wg.Wait()

		admins := 0
		members, err := groupRepo.GetGroupMembers(g.ID, ctx)
		require.NoError(t, err)
		for _, m := range members {
			if m.Role == models.GroupRoleAdmin {
				admins++
			}
		}
		assert.GreaterOrEqual(t, admins, 1, "nunca queda sin admins")

		failed := 0
		for _, err := range errs {
			if err != nil {
				failed++
			}
		}
		assert.GreaterOrEqual(t, failed, 1, "la segunda transacción re-verifica al actor ya degradado")
	})
}
