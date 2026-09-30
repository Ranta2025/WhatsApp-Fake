package services

import (
	"context"
	"testing"

	"gorm/backend/models"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

const createGroupCreatorTel = "+34600000009"

// TestCreateGroup_Settings cubre los tres settings opcionales de la creación
// (CUSTOM 2026-09-30): presentes (restringidos) y ausentes (default abierto).
// Verifica que se persisten en el grupo insertado y que la respuesta (detail)
// los refleja. La creación NO genera system message: el grupo nace con esos
// valores, por lo que no hay cambio que notificar.
func TestCreateGroup_Settings(t *testing.T) {
	tests := []struct {
		name     string
		data     models.GroupCreate
		wantSend bool
		wantEdit bool
		wantAdd  bool
	}{
		{
			name: "con settings restringidos",
			data: models.GroupCreate{
				Name:                    "Configurado",
				Members:                 []string{"+34600000002"},
				OnlyAdminsCanSend:       true,
				OnlyAdminsCanEditInfo:   true,
				OnlyAdminsCanAddMembers: true,
			},
			wantSend: true,
			wantEdit: true,
			wantAdd:  true,
		},
		{
			name: "sin settings: default abierto",
			data: models.GroupCreate{
				Name:    "Abierto",
				Members: []string{"+34600000002"},
			},
			wantSend: false,
			wantEdit: false,
			wantAdd:  false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			svc, repo, contacts := newGroupServiceForSend()
			ctx := context.Background()

			contacts.On("GetIdByTelephon", createGroupCreatorTel, mock.Anything).Return(1, nil)
			contacts.On("GetIdByTelephon", "+34600000002", mock.Anything).Return(2, nil)
			contacts.On("IsAcceptedContact", uint(1), uint(2), mock.Anything).Return(true, nil)
			contacts.On("GetTelephonByID", uint(1), mock.Anything).Return(createGroupCreatorTel, nil)

			// Captura el *models.Group que el servicio manda a persistir y le
			// asigna un ID para que GetGroupDetail pueda releerlo.
			var persisted *models.Group
			repo.On("CreateGroupWithMembers", mock.Anything, uint(1), []uint{2}, mock.Anything).
				Run(func(args mock.Arguments) {
					persisted = args.Get(0).(*models.Group)
					persisted.ID = 55
				}).Return(nil)

			repo.On("IsMember", uint(55), uint(1), mock.Anything).Return(true, nil)
			// Lo que GetGroupDetail relee de la DB es el grupo ya persistido;
			// el mock devuelve un grupo con los settings del caso.
			repo.On("GetGroupByID", uint(55), mock.Anything).Return(&models.Group{
				Name:                    tc.data.Name,
				CreatorID:               1,
				OnlyAdminsCanSend:       tc.wantSend,
				OnlyAdminsCanEditInfo:   tc.wantEdit,
				OnlyAdminsCanAddMembers: tc.wantAdd,
			}, nil)
			repo.On("GetGroupMembers", uint(55), mock.Anything).Return([]models.GroupMember{
				{
					GroupID: 55,
					UserID:  1,
					Role:    models.GroupRoleAdmin,
					User: models.UserDataBase{User: models.User{
						Telephon: createGroupCreatorTel,
						Username: "ana",
					}},
				},
			}, nil)
			repo.On("GetGroupMessages", uint(55), 50, 0, mock.Anything).Return([]models.GroupMessage{}, nil)

			detail, err := svc.CreateGroup(createGroupCreatorTel, tc.data, ctx)
			require.NoError(t, err)
			require.NotNil(t, persisted)
			require.NotNil(t, detail)

			// Persistencia: el grupo insertado lleva los settings.
			assert.Equal(t, tc.wantSend, persisted.OnlyAdminsCanSend)
			assert.Equal(t, tc.wantEdit, persisted.OnlyAdminsCanEditInfo)
			assert.Equal(t, tc.wantAdd, persisted.OnlyAdminsCanAddMembers)

			// Respuesta: el detalle los refleja.
			assert.Equal(t, tc.wantSend, detail.OnlyAdminsCanSend)
			assert.Equal(t, tc.wantEdit, detail.OnlyAdminsCanEditInfo)
			assert.Equal(t, tc.wantAdd, detail.OnlyAdminsCanAddMembers)

			// La creación no persiste ningún mensaje de sistema.
			repo.AssertNotCalled(t, "CreateGroupMessage", mock.Anything, mock.Anything)
		})
	}
}
