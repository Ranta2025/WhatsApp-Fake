package services

import (
	"context"
	"errors"
	"testing"

	"gorm/backend/models"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"gorm.io/gorm"
)

// ─────────────────────────────────────────────────────────────────────────────
// Matriz pura de permisos
// ─────────────────────────────────────────────────────────────────────────────

// TestPermissionMatrix verifica la matriz pura: un admin siempre puede; un
// miembro sólo cuando la restricción correspondiente está apagada.
func TestPermissionMatrix(t *testing.T) {
	cases := []struct {
		name       string
		admin      bool
		restricted bool
		want       bool
	}{
		{"admin con restricción puede", true, true, true},
		{"admin sin restricción puede", true, false, true},
		{"miembro con restricción no puede", false, true, false},
		{"miembro sin restricción puede", false, false, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, canSend(tc.admin, tc.restricted), "canSend")
			assert.Equal(t, tc.want, canEditInfo(tc.admin, tc.restricted), "canEditInfo")
			assert.Equal(t, tc.want, canAddMembers(tc.admin, tc.restricted), "canAddMembers")
		})
	}
}

func TestIsAdminRole(t *testing.T) {
	assert.True(t, isAdmin(models.GroupRoleAdmin))
	assert.False(t, isAdmin(models.GroupRoleMember))
	assert.False(t, isAdmin(""))
	assert.False(t, isAdmin("left"))
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers requireAdmin / requireCan* (con mocks)
// ─────────────────────────────────────────────────────────────────────────────

const (
	permGroupID  uint = 11
	permActorID       = 5
	permActorTel      = "+34600000099"
)

func newPermissionService() (*ServiceGroup, *MockGroupRepo, *MockGroupContactRepo) {
	repo := &MockGroupRepo{}
	contacts := &MockGroupContactRepo{}
	svc := InitServiceGroup(repo, contacts).(*ServiceGroup)
	return svc, repo, contacts
}

// expectActorRole prepara la resolución teléfono->id y el rol devuelto por el repo.
func expectActorRole(repo *MockGroupRepo, contacts *MockGroupContactRepo, role string) {
	contacts.On("GetIdByTelephon", permActorTel, mock.Anything).Return(permActorID, nil)
	repo.On("GetMemberRole", permGroupID, uint(permActorID), mock.Anything).Return(role, nil)
}

func TestRequireAdmin(t *testing.T) {
	t.Run("admin autorizado", func(t *testing.T) {
		svc, repo, contacts := newPermissionService()
		expectActorRole(repo, contacts, "admin")

		assert.NoError(t, svc.requireAdmin(permActorTel, permGroupID, context.Background()))
	})

	t.Run("miembro rechazado con ErrNotGroupAdmin", func(t *testing.T) {
		svc, repo, contacts := newPermissionService()
		expectActorRole(repo, contacts, "member")

		err := svc.requireAdmin(permActorTel, permGroupID, context.Background())
		assert.ErrorIs(t, err, ErrNotGroupAdmin)
	})

	t.Run("no miembro rechazado con ErrNotGroupMember", func(t *testing.T) {
		svc, repo, contacts := newPermissionService()
		contacts.On("GetIdByTelephon", permActorTel, mock.Anything).Return(permActorID, nil)
		repo.On("GetMemberRole", permGroupID, uint(permActorID), mock.Anything).
			Return("", errors.New("el usuario no es miembro del grupo"))

		err := svc.requireAdmin(permActorTel, permGroupID, context.Background())
		assert.ErrorIs(t, err, ErrNotGroupMember)
	})

	t.Run("usuario inexistente rechazado", func(t *testing.T) {
		svc, _, contacts := newPermissionService()
		contacts.On("GetIdByTelephon", permActorTel, mock.Anything).Return(0, errors.New("db error"))

		err := svc.requireAdmin(permActorTel, permGroupID, context.Background())
		assert.EqualError(t, err, "usuario no encontrado")
	})
}

func TestRequireCanSend(t *testing.T) {
	settingsCases := []struct {
		name       string
		role       string
		onlyAdmins bool
		wantErr    error
	}{
		{"admin puede aunque la restricción esté activa", "admin", true, nil},
		{"admin puede sin restricción", "admin", false, nil},
		{"miembro puede si está abierto", "member", false, nil},
		{"miembro bloqueado si sólo admins", "member", true, ErrGroupSendRestricted},
	}
	for _, tc := range settingsCases {
		t.Run(tc.name, func(t *testing.T) {
			svc, repo, contacts := newPermissionService()
			expectActorRole(repo, contacts, tc.role)
			repo.On("GetGroupByID", permGroupID, mock.Anything).
				Return(&models.Group{OnlyAdminsCanSend: tc.onlyAdmins}, nil)

			err := svc.requireCanSend(permActorTel, permGroupID, context.Background())
			if tc.wantErr == nil {
				assert.NoError(t, err)
			} else {
				assert.ErrorIs(t, err, tc.wantErr)
			}
		})
	}

	t.Run("no miembro rechazado con ErrNotGroupMember", func(t *testing.T) {
		svc, repo, contacts := newPermissionService()
		contacts.On("GetIdByTelephon", permActorTel, mock.Anything).Return(permActorID, nil)
		repo.On("GetMemberRole", permGroupID, uint(permActorID), mock.Anything).
			Return("", errors.New("el usuario no es miembro del grupo"))

		err := svc.requireCanSend(permActorTel, permGroupID, context.Background())
		assert.ErrorIs(t, err, ErrNotGroupMember)
	})
}

func TestRequireCanEditInfo(t *testing.T) {
	cases := []struct {
		role       string
		onlyAdmins bool
		wantErr    error
	}{
		{"admin", true, nil},
		{"member", false, nil},
		{"member", true, ErrGroupEditRestricted},
	}
	for _, tc := range cases {
		t.Run(tc.role+"_"+boolLabel(tc.onlyAdmins), func(t *testing.T) {
			svc, repo, contacts := newPermissionService()
			expectActorRole(repo, contacts, tc.role)
			repo.On("GetGroupByID", permGroupID, mock.Anything).
				Return(&models.Group{OnlyAdminsCanEditInfo: tc.onlyAdmins}, nil)

			err := svc.requireCanEditInfo(permActorTel, permGroupID, context.Background())
			if tc.wantErr == nil {
				assert.NoError(t, err)
			} else {
				assert.ErrorIs(t, err, tc.wantErr)
			}
		})
	}
}

func TestRequireCanAddMembers(t *testing.T) {
	cases := []struct {
		role       string
		onlyAdmins bool
		wantErr    error
	}{
		{"admin", true, nil},
		{"member", false, nil},
		{"member", true, ErrGroupAddRestricted},
	}
	for _, tc := range cases {
		t.Run(tc.role+"_"+boolLabel(tc.onlyAdmins), func(t *testing.T) {
			svc, repo, contacts := newPermissionService()
			expectActorRole(repo, contacts, tc.role)
			repo.On("GetGroupByID", permGroupID, mock.Anything).
				Return(&models.Group{OnlyAdminsCanAddMembers: tc.onlyAdmins}, nil)

			err := svc.requireCanAddMembers(permActorTel, permGroupID, context.Background())
			if tc.wantErr == nil {
				assert.NoError(t, err)
			} else {
				assert.ErrorIs(t, err, tc.wantErr)
			}
		})
	}
}

func boolLabel(v bool) string {
	if v {
		return "restricted"
	}
	return "open"
}

// ─────────────────────────────────────────────────────────────────────────────
// Exposición de settings y rol en las respuestas
// ─────────────────────────────────────────────────────────────────────────────

func TestGetUserGroupsMapsSettingsAndRole(t *testing.T) {
	svc, repo, contacts := newPermissionService()
	contacts.On("GetIdByTelephon", permActorTel, mock.Anything).Return(permActorID, nil)
	repo.On("GetUserGroups", uint(permActorID), mock.Anything).Return([]models.UserGroupRow{
		{
			Group: models.Group{
				Model:                   gorm.Model{ID: permGroupID},
				Name:                    "Equipo",
				OnlyAdminsCanSend:       true,
				OnlyAdminsCanEditInfo:   false,
				OnlyAdminsCanAddMembers: true,
			},
			UserRole:    "admin",
			MemberCount: 3,
		},
	}, nil)

	groups, err := svc.GetUserGroups(permActorTel, context.Background())

	assert.NoError(t, err)
	if assert.Len(t, groups, 1) {
		assert.Equal(t, "admin", groups[0].UserRole)
		assert.True(t, groups[0].OnlyAdminsCanSend)
		assert.False(t, groups[0].OnlyAdminsCanEditInfo)
		assert.True(t, groups[0].OnlyAdminsCanAddMembers)
	}
}

func TestGetGroupDetailMapsSettingsAndCallerRole(t *testing.T) {
	svc, repo, contacts := newPermissionService()
	contacts.On("GetIdByTelephon", permActorTel, mock.Anything).Return(permActorID, nil)
	repo.On("IsMember", permGroupID, uint(permActorID), mock.Anything).Return(true, nil)
	repo.On("GetGroupByID", permGroupID, mock.Anything).Return(&models.Group{
		Model:                   gorm.Model{ID: permGroupID},
		Name:                    "Equipo",
		OnlyAdminsCanSend:       true,
		OnlyAdminsCanEditInfo:   true,
		OnlyAdminsCanAddMembers: false,
	}, nil)
	repo.On("GetGroupMembers", permGroupID, mock.Anything).Return([]models.GroupMember{
		{
			Model:  gorm.Model{ID: 1},
			UserID: uint(permActorID),
			Role:   "member",
			User:   models.UserDataBase{User: models.User{Telephon: permActorTel, Username: "ana"}},
		},
	}, nil)
	repo.On("GetGroupMessages", permGroupID, 50, 0, mock.Anything).Return([]models.GroupMessage{}, nil)
	contacts.On("GetTelephonByID", mock.Anything, mock.Anything).Return(permActorTel, nil)

	detail, err := svc.GetGroupDetail(permActorTel, permGroupID, context.Background())

	assert.NoError(t, err)
	if assert.NotNil(t, detail) {
		assert.Equal(t, "member", detail.UserRole)
		assert.True(t, detail.OnlyAdminsCanSend)
		assert.True(t, detail.OnlyAdminsCanEditInfo)
		assert.False(t, detail.OnlyAdminsCanAddMembers)
	}
}
