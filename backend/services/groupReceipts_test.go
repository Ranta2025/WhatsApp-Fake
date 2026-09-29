package services

import (
	"errors"
	"gorm/backend/models"
	"gorm/backend/schemas"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"gorm.io/gorm"
)

// member construye un miembro con marcas de agua para los tests de acuses.
func member(userID uint, tel string, joined, delivered, read uint) models.GroupMember {
	return models.GroupMember{
		UserID:                 userID,
		JoinedMessageID:        joined,
		LastDeliveredMessageID: delivered,
		LastReadMessageID:      read,
		User:                   models.UserDataBase{User: models.User{Model: gorm.Model{ID: userID}, Telephon: tel, Username: "u" + tel}},
	}
}

func telephonsOf(list []schemas.GroupMemberBrief) []string {
	out := make([]string, 0, len(list))
	for _, m := range list {
		out = append(out, m.Telephon)
	}
	return out
}

func TestGroupMessageStatus(t *testing.T) {
	const sender uint = 1
	cases := []struct {
		name    string
		msgID   uint
		members []models.GroupMember
		want    string
	}{
		{"sin otros miembros -> enviado", 10, []models.GroupMember{member(sender, "s", 0, 0, 0)}, StatusSent},
		{"nadie entregado -> enviado", 10, []models.GroupMember{member(sender, "s", 0, 0, 0), member(2, "a", 0, 0, 0), member(3, "b", 0, 0, 0)}, StatusSent},
		{"solo uno entregado -> enviado", 10, []models.GroupMember{member(2, "a", 0, 10, 0), member(3, "b", 0, 9, 0)}, StatusSent},
		{"todos entregados -> entregado", 10, []models.GroupMember{member(2, "a", 0, 10, 0), member(3, "b", 0, 12, 0)}, StatusDelivered},
		{"leido implica entregado", 10, []models.GroupMember{member(2, "a", 0, 0, 10), member(3, "b", 0, 10, 0)}, StatusDelivered},
		{"uno leyo y otro no -> entregado", 10, []models.GroupMember{member(2, "a", 0, 10, 10), member(3, "b", 0, 10, 9)}, StatusDelivered},
		{"todos leyeron -> visto", 10, []models.GroupMember{member(2, "a", 0, 10, 10), member(3, "b", 0, 10, 11)}, StatusRead},
		{"lectura sin marca de entrega -> visto", 10, []models.GroupMember{member(2, "a", 0, 0, 10)}, StatusRead},
		{"el remitente no cuenta", 10, []models.GroupMember{member(sender, "s", 0, 0, 0), member(2, "a", 0, 10, 10)}, StatusRead},
		{"miembro unido despues no cuenta", 10, []models.GroupMember{member(2, "a", 0, 10, 10), member(3, "late", 10, 0, 0)}, StatusRead},
		{"unido antes del mensaje cuenta", 10, []models.GroupMember{member(2, "a", 0, 10, 10), member(3, "b", 9, 0, 0)}, StatusSent},
		{"solo miembros posteriores -> enviado", 10, []models.GroupMember{member(3, "late", 10, 0, 0)}, StatusSent},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			assert.Equal(t, c.want, GroupMessageStatus(c.msgID, sender, c.members))
		})
	}
}

func TestPartitionGroupReceipts(t *testing.T) {
	const sender uint = 1
	members := []models.GroupMember{
		member(sender, "s", 0, 0, 0),
		member(2, "reader", 0, 10, 10),
		member(3, "delivered", 0, 10, 0),
		member(4, "pending", 0, 5, 0),
		member(5, "late", 10, 0, 0),
	}
	got := partitionGroupReceipts(10, sender, members)
	assert.Equal(t, []string{"reader"}, telephonsOf(got.ReadBy))
	assert.Equal(t, []string{"delivered"}, telephonsOf(got.DeliveredTo))
	assert.Equal(t, []string{"pending"}, telephonsOf(got.Pending))
}

func TestGetGroupMessageReceipts(t *testing.T) {
	const msgID uint = 10
	setup := func() (GroupServicer, *MockGroupRepo, *MockGroupContactRepo) {
		svc, repo, contacts := newGroupServiceForSend()
		contacts.On("GetIdByTelephon", testSenderTel, mock.Anything).Return(testSenderID, nil)
		repo.On("IsMember", testGroupID, uint(testSenderID), mock.Anything).Return(true, nil)
		return svc, repo, contacts
	}

	t.Run("autor recibe las listas", func(t *testing.T) {
		svc, repo, _ := setup()
		repo.On("GetGroupMessageByID", msgID, mock.Anything).
			Return(&models.GroupMessage{Model: gorm.Model{ID: msgID}, GroupID: testGroupID, SenderID: testSenderID}, nil)
		repo.On("GetGroupMembers", testGroupID, mock.Anything).Return([]models.GroupMember{
			member(testSenderID, "s", 0, 0, 0),
			member(2, "reader", 0, 10, 10),
			member(3, "pending", 0, 0, 0),
		}, nil)
		got, err := svc.GetGroupMessageReceipts(testSenderTel, testGroupID, msgID, t.Context())
		assert.NoError(t, err)
		assert.Equal(t, []string{"reader"}, telephonsOf(got.ReadBy))
		assert.Equal(t, []string{"pending"}, telephonsOf(got.Pending))
		assert.Empty(t, got.DeliveredTo)
	})

	t.Run("no autor -> ErrNotMessageSender", func(t *testing.T) {
		svc, repo, _ := setup()
		repo.On("GetGroupMessageByID", msgID, mock.Anything).
			Return(&models.GroupMessage{Model: gorm.Model{ID: msgID}, GroupID: testGroupID, SenderID: 999}, nil)
		got, err := svc.GetGroupMessageReceipts(testSenderTel, testGroupID, msgID, t.Context())
		assert.Nil(t, got)
		assert.True(t, errors.Is(err, ErrNotMessageSender))
	})

	t.Run("mensaje inexistente -> ErrGroupMessageNotFound", func(t *testing.T) {
		svc, repo, _ := setup()
		repo.On("GetGroupMessageByID", msgID, mock.Anything).Return(nil, models.ErrGroupMessageNotFound)
		_, err := svc.GetGroupMessageReceipts(testSenderTel, testGroupID, msgID, t.Context())
		assert.True(t, errors.Is(err, ErrGroupMessageNotFound))
	})

	t.Run("mensaje de otro grupo -> no encontrado", func(t *testing.T) {
		svc, repo, _ := setup()
		repo.On("GetGroupMessageByID", msgID, mock.Anything).
			Return(&models.GroupMessage{Model: gorm.Model{ID: msgID}, GroupID: testGroupID + 1, SenderID: testSenderID}, nil)
		_, err := svc.GetGroupMessageReceipts(testSenderTel, testGroupID, msgID, t.Context())
		assert.True(t, errors.Is(err, ErrGroupMessageNotFound))
		assert.False(t, errors.Is(err, ErrNotMessageSender))
	})

	t.Run("no miembro rechazado", func(t *testing.T) {
		svc, repo, contacts := newGroupServiceForSend()
		contacts.On("GetIdByTelephon", testSenderTel, mock.Anything).Return(testSenderID, nil)
		repo.On("IsMember", testGroupID, uint(testSenderID), mock.Anything).Return(false, nil)
		_, err := svc.GetGroupMessageReceipts(testSenderTel, testGroupID, msgID, t.Context())
		assert.True(t, errors.Is(err, ErrNotGroupMember))
		repo.AssertNotCalled(t, "GetGroupMessageByID", mock.Anything, mock.Anything)
	})

	t.Run("error de infraestructura en IsMember no es 403", func(t *testing.T) {
		svc, repo, contacts := newGroupServiceForSend()
		contacts.On("GetIdByTelephon", testSenderTel, mock.Anything).Return(testSenderID, nil)
		dbErr := errors.New("db caída")
		repo.On("IsMember", testGroupID, uint(testSenderID), mock.Anything).Return(false, dbErr)
		_, err := svc.GetGroupMessageReceipts(testSenderTel, testGroupID, msgID, t.Context())
		assert.True(t, errors.Is(err, dbErr))
		assert.False(t, errors.Is(err, ErrNotGroupMember))
	})
}

func TestAdvanceGroupReceipts(t *testing.T) {
	setup := func(isMember bool) (GroupServicer, *MockGroupRepo) {
		svc, repo, contacts := newGroupServiceForSend()
		contacts.On("GetIdByTelephon", testSenderTel, mock.Anything).Return(testSenderID, nil)
		repo.On("IsMember", testGroupID, uint(testSenderID), mock.Anything).Return(isMember, nil)
		return svc, repo
	}

	t.Run("delivered avanza y devuelve el estado", func(t *testing.T) {
		svc, repo := setup(true)
		repo.On("AdvanceMemberReceipts", testGroupID, uint(testSenderID), uint(15), uint(0), mock.Anything).
			Return(models.GroupReceiptState{DeliveredUpTo: 15, ReadUpTo: 3}, true, nil)
		got, err := svc.AdvanceGroupDelivered(testSenderTel, testGroupID, 15, t.Context())
		assert.NoError(t, err)
		if assert.NotNil(t, got) {
			assert.Equal(t, testGroupID, got.GroupID)
			assert.Equal(t, testSenderTel, got.Telephon)
			assert.Equal(t, uint(15), got.DeliveredUpTo)
			assert.Equal(t, uint(3), got.ReadUpTo)
		}
	})

	t.Run("read avanza (repo recibe read y delivered)", func(t *testing.T) {
		svc, repo := setup(true)
		repo.On("AdvanceMemberReceipts", testGroupID, uint(testSenderID), uint(20), uint(20), mock.Anything).
			Return(models.GroupReceiptState{DeliveredUpTo: 20, ReadUpTo: 20}, true, nil)
		got, err := svc.AdvanceGroupRead(testSenderTel, testGroupID, 20, t.Context())
		assert.NoError(t, err)
		if assert.NotNil(t, got) {
			assert.Equal(t, uint(20), got.ReadUpTo)
		}
	})

	t.Run("sin cambio -> nil", func(t *testing.T) {
		svc, repo := setup(true)
		repo.On("AdvanceMemberReceipts", testGroupID, uint(testSenderID), uint(5), uint(0), mock.Anything).
			Return(models.GroupReceiptState{DeliveredUpTo: 15, ReadUpTo: 3}, false, nil)
		got, err := svc.AdvanceGroupDelivered(testSenderTel, testGroupID, 5, t.Context())
		assert.NoError(t, err)
		assert.Nil(t, got)
	})

	t.Run("no miembro rechazado sin tocar el repo", func(t *testing.T) {
		svc, repo := setup(false)
		got, err := svc.AdvanceGroupRead(testSenderTel, testGroupID, 20, t.Context())
		assert.Nil(t, got)
		assert.Error(t, err)
		repo.AssertNotCalled(t, "AdvanceMemberReceipts", mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything)
	})

	t.Run("upTo 0 se ignora", func(t *testing.T) {
		svc, repo := setup(true)
		got, err := svc.AdvanceGroupDelivered(testSenderTel, testGroupID, 0, t.Context())
		assert.NoError(t, err)
		assert.Nil(t, got)
		repo.AssertNotCalled(t, "AdvanceMemberReceipts", mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything)
	})
}

func TestGetGroupDetail_MembersCarryWatermarks(t *testing.T) {
	svc, repo, contacts := newGroupServiceForSend()
	contacts.On("GetIdByTelephon", testSenderTel, mock.Anything).Return(testSenderID, nil)
	contacts.On("GetTelephonByID", uint(1), mock.Anything).Return("+1", nil)
	repo.On("IsMember", testGroupID, uint(testSenderID), mock.Anything).Return(true, nil)
	repo.On("GetGroupByID", testGroupID, mock.Anything).Return(&models.Group{Model: gorm.Model{ID: testGroupID}, CreatorID: 1}, nil)
	repo.On("GetGroupMessages", testGroupID, 50, 0, mock.Anything).Return([]models.GroupMessage{}, nil)
	repo.On("GetGroupMembers", testGroupID, mock.Anything).Return([]models.GroupMember{
		member(2, "a", 4, 30, 20),
	}, nil)

	detail, err := svc.GetGroupDetail(testSenderTel, testGroupID, t.Context())
	assert.NoError(t, err)
	if assert.Len(t, detail.Members, 1) {
		m := detail.Members[0]
		assert.Equal(t, uint(4), m.JoinedMessageID)
		assert.Equal(t, uint(30), m.LastDeliveredMessageID)
		assert.Equal(t, uint(20), m.LastReadMessageID)
	}
}
