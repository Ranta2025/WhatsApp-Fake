package services

import (
	"context"
	"errors"
	"testing"

	"gorm/backend/models"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// ─────────────────────────────────────────────────────────────────────────────
// GA4: enforcement de la matriz de permisos en cada path protegido.
//
// Cada test ejercita la ruta de servicio (la que cubre REST y WS a la vez para
// el envío) con el rol del actor y la restricción del grupo, y comprueba que un
// miembro restringido recibe el error tipado ANTES de tocar el repo.
// ─────────────────────────────────────────────────────────────────────────────

// expectSenderContext prepara la resolución del actor y la lectura de settings.
func expectSenderContext(repo *MockGroupRepo, contacts *MockGroupContactRepo, role string, group *models.Group) {
	contacts.On("GetIdByTelephon", testSenderTel, mock.Anything).Return(testSenderID, nil)
	repo.On("GetMemberRole", testGroupID, uint(testSenderID), mock.Anything).Return(role, nil)
	repo.On("GetGroupByID", testGroupID, mock.Anything).Return(group, nil)
}

// ── Enviar mensaje (REST y WS group_chat comparten SendGroupMessage) ─────────

func TestSendGroupMessage_EnforcementPerSetting(t *testing.T) {
	cases := []struct {
		name       string
		role       string
		restricted bool
		wantErr    error
	}{
		{"admin envía con la restricción activa", models.GroupRoleAdmin, true, nil},
		{"miembro envía si está abierto", models.GroupRoleMember, false, nil},
		{"miembro bloqueado si solo admins", models.GroupRoleMember, true, ErrGroupSendRestricted},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			svc, repo, contacts := newGroupServiceForSend()
			expectSenderContext(repo, contacts, tc.role, &models.Group{OnlyAdminsCanSend: tc.restricted})
			contacts.On("GetUsernameByTelephon", testSenderTel, mock.Anything).Return("ana", nil)
			if tc.wantErr == nil {
				repo.On("CreateGroupMessage", mock.Anything, mock.Anything).Return(nil)
			}

			resp, err := svc.SendGroupMessage(testSenderTel, models.GroupMessageSend{
				GroupID: testGroupID, Message: "hola",
			}, context.Background())

			if tc.wantErr != nil {
				assert.ErrorIs(t, err, tc.wantErr)
				assert.Nil(t, resp)
				repo.AssertNotCalled(t, "CreateGroupMessage", mock.Anything, mock.Anything)
				return
			}
			require.NoError(t, err)
			require.NotNil(t, resp)
		})
	}
}

func TestSendGroupMessage_NonMemberRejectedTyped(t *testing.T) {
	svc, repo, contacts := newGroupServiceForSend()
	contacts.On("GetIdByTelephon", testSenderTel, mock.Anything).Return(testSenderID, nil)
	repo.On("GetMemberRole", testGroupID, uint(testSenderID), mock.Anything).Return("", errors.New("no miembro"))

	resp, err := svc.SendGroupMessage(testSenderTel, models.GroupMessageSend{
		GroupID: testGroupID, Message: "hola",
	}, context.Background())

	assert.Nil(t, resp)
	assert.ErrorIs(t, err, ErrNotGroupMember)
	repo.AssertNotCalled(t, "CreateGroupMessage", mock.Anything, mock.Anything)
}

// ── Editar mensaje propio (misma matriz que enviar) ─────────────────────────

func TestEditGroupMessage_EnforcementPerSetting(t *testing.T) {
	cases := []struct {
		name       string
		role       string
		restricted bool
		wantErr    error
	}{
		{"admin edita con la restricción activa", models.GroupRoleAdmin, true, nil},
		{"miembro edita si está abierto", models.GroupRoleMember, false, nil},
		{"miembro bloqueado si solo admins", models.GroupRoleMember, true, ErrGroupSendRestricted},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			svc, repo, contacts := newGroupServiceForSend()
			expectSenderContext(repo, contacts, tc.role, &models.Group{OnlyAdminsCanSend: tc.restricted})
			contacts.On("GetUsernameByTelephon", testSenderTel, mock.Anything).Return("ana", nil)
			if tc.wantErr == nil {
				repo.On("EditGroupMessage", testGroupID, uint(50), uint(testSenderID), "editado", mock.Anything).Return(nil)
				repo.On("GetGroupMessageByID", uint(50), mock.Anything).Return(&models.GroupMessage{
					Model: gorm.Model{ID: 50}, GroupID: testGroupID, SenderID: uint(testSenderID), Message: "editado",
				}, nil)
			}

			resp, err := svc.EditGroupMessage(testSenderTel, testGroupID, models.GroupMessageEdit{
				MessageID: 50, Message: "editado",
			}, context.Background())

			if tc.wantErr != nil {
				assert.ErrorIs(t, err, tc.wantErr)
				assert.Nil(t, resp)
				repo.AssertNotCalled(t, "EditGroupMessage", mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything)
				return
			}
			require.NoError(t, err)
			require.NotNil(t, resp)
		})
	}
}

// Borrar el mensaje propio NO se restringe: un miembro bloqueado para enviar
// sigue pudiendo borrar su historial (decisión cerrada 2026-09-30).
func TestDeleteGroupMessage_RestrictedMemberStillAllowed(t *testing.T) {
	svc, repo, contacts := newGroupServiceForSend()
	contacts.On("GetIdByTelephon", testSenderTel, mock.Anything).Return(testSenderID, nil)
	repo.On("IsMember", testGroupID, uint(testSenderID), mock.Anything).Return(true, nil)
	repo.On("DeleteGroupMessage", testGroupID, uint(50), uint(testSenderID), mock.Anything).Return(nil)

	err := svc.DeleteGroupMessage(testSenderTel, testGroupID, models.GroupMessageDelete{MessageID: 50}, context.Background())

	require.NoError(t, err)
	repo.AssertCalled(t, "DeleteGroupMessage", testGroupID, uint(50), uint(testSenderID), mock.Anything)
	repo.AssertNotCalled(t, "GetGroupByID", mock.Anything, mock.Anything)
}

// ── Agregar participantes ───────────────────────────────────────────────────

func TestAddMembers_EnforcementPerSetting(t *testing.T) {
	const targetTel = "+34600000011"

	cases := []struct {
		name       string
		role       string
		restricted bool
		wantErr    error
	}{
		{"admin agrega con la restricción activa", models.GroupRoleAdmin, true, nil},
		{"miembro agrega si está abierto", models.GroupRoleMember, false, nil},
		{"miembro bloqueado si solo admins", models.GroupRoleMember, true, ErrGroupAddRestricted},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			svc, repo, contacts := newGroupServiceForSend()
			expectSenderContext(repo, contacts, tc.role, &models.Group{OnlyAdminsCanAddMembers: tc.restricted})
			if tc.wantErr == nil {
				contacts.On("GetIdByTelephon", targetTel, mock.Anything).Return(11, nil)
				contacts.On("IsAcceptedContact", uint(testSenderID), uint(11), mock.Anything).Return(true, nil)
				repo.On("AddMembers", testGroupID, mock.Anything, mock.Anything, mock.Anything).
					Return([]models.GroupMember{userMember(11, targetTel, "marta")}, nil)
			}

			added, _, err := svc.AddMembers(testSenderTel, testGroupID,
				models.GroupAddMembers{Members: []string{targetTel}}, context.Background())

			if tc.wantErr != nil {
				assert.ErrorIs(t, err, tc.wantErr)
				assert.Nil(t, added)
				contacts.AssertNotCalled(t, "IsAcceptedContact", mock.Anything, mock.Anything, mock.Anything)
				repo.AssertNotCalled(t, "AddMembers", mock.Anything, mock.Anything, mock.Anything, mock.Anything)
				return
			}
			require.NoError(t, err)
			assert.Len(t, added, 1)
		})
	}
}

// ── Editar info (avatar; name/description ya usan requireCanEditInfo) ───────

func TestUpdateGroupAvatar_EnforcementPerSetting(t *testing.T) {
	cases := []struct {
		name       string
		role       string
		restricted bool
		wantErr    error
	}{
		{"admin edita info con la restricción activa", models.GroupRoleAdmin, true, nil},
		{"miembro edita info si está abierto", models.GroupRoleMember, false, nil},
		{"miembro bloqueado si solo admins", models.GroupRoleMember, true, ErrGroupEditRestricted},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			svc, repo, contacts := newGroupServiceForSend()
			expectSenderContext(repo, contacts, tc.role, &models.Group{OnlyAdminsCanEditInfo: tc.restricted})
			if tc.wantErr == nil {
				repo.On("UpdateGroupAvatar", testGroupID, "/storage/avatar.png", mock.Anything).Return(nil)
			}

			err := svc.UpdateGroupAvatar(testSenderTel, testGroupID, "/storage/avatar.png", context.Background())

			if tc.wantErr != nil {
				assert.ErrorIs(t, err, tc.wantErr)
				repo.AssertNotCalled(t, "UpdateGroupAvatar", mock.Anything, mock.Anything, mock.Anything)
				return
			}
			assert.NoError(t, err)
		})
	}
}

// La comprobación pública que usa el indicador "escribiendo" reusa la matriz.
func TestRequireCanSend_ExposedForTyping(t *testing.T) {
	svc, repo, contacts := newPermissionService()
	expectActorRole(repo, contacts, models.GroupRoleMember)
	repo.On("GetGroupByID", permGroupID, mock.Anything).Return(&models.Group{OnlyAdminsCanSend: true}, nil)

	err := svc.RequireCanSend(permActorTel, permGroupID, context.Background())

	assert.ErrorIs(t, err, ErrGroupSendRestricted)
}
