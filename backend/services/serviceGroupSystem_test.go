package services

import (
	"context"
	"errors"
	"gorm/backend/models"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// helper: miembro con datos de usuario para alimentar los mocks del repo.
func userMember(userID uint, tel, username string) models.GroupMember {
	return models.GroupMember{
		UserID: userID,
		User: models.UserDataBase{
			User: models.User{Model: gorm.Model{ID: userID}, Telephon: tel, Username: username},
		},
	}
}

// AddMembers debe devolver la lista realmente añadida (la que decide el repo en
// su transacción) y pasar un mensaje de sistema `member_added` a esa misma
// transacción; ya no es el handler quien la infiere.
func TestAddMembers_ReturnsActuallyAddedAndPassesSystemEvent(t *testing.T) {
	svc, repo, contacts := newGroupServiceForSend()
	contacts.On("GetIdByTelephon", testSenderTel, mock.Anything).Return(testSenderID, nil)
	contacts.On("GetIdByTelephon", "+34600000011", mock.Anything).Return(11, nil)
	contacts.On("GetIdByTelephon", "+34600000012", mock.Anything).Return(12, nil)
	contacts.On("IsAcceptedContact", uint(testSenderID), uint(11), mock.Anything).Return(true, nil)
	contacts.On("IsAcceptedContact", uint(testSenderID), uint(12), mock.Anything).Return(true, nil)
	repo.On("IsMember", testGroupID, uint(testSenderID), mock.Anything).Return(true, nil)

	addedMembers := []models.GroupMember{
		userMember(11, "+34600000011", "marta"),
		userMember(12, "+34600000012", "luis"),
	}
	repo.On("AddMembers", testGroupID, mock.Anything, mock.MatchedBy(func(m *models.GroupMessage) bool {
		return m != nil &&
			m.Kind == models.GroupMessageKindSystem &&
			m.SystemEvent == models.SystemEventMemberAdded &&
			m.GroupID == testGroupID &&
			m.SenderID == uint(testSenderID)
	}), mock.Anything).Return(addedMembers, nil)

	added, err := svc.AddMembers(testSenderTel, testGroupID,
		models.GroupAddMembers{Members: []string{"+34600000011", "+34600000012"}}, context.Background())

	require.NoError(t, err)
	require.Len(t, added, 2)
	assert.Equal(t, "+34600000011", added[0].Telephon)
	assert.Equal(t, "marta", added[0].Username)
	assert.Equal(t, "+34600000012", added[1].Telephon)
	repo.AssertExpectations(t)
}

// Un error del repo no debe devolver miembros añadidos.
func TestAddMembers_RepoErrorPropagates(t *testing.T) {
	svc, repo, contacts := newGroupServiceForSend()
	contacts.On("GetIdByTelephon", testSenderTel, mock.Anything).Return(testSenderID, nil)
	contacts.On("GetIdByTelephon", "+34600000011", mock.Anything).Return(11, nil)
	contacts.On("IsAcceptedContact", uint(testSenderID), uint(11), mock.Anything).Return(true, nil)
	repo.On("IsMember", testGroupID, uint(testSenderID), mock.Anything).Return(true, nil)
	repo.On("AddMembers", testGroupID, mock.Anything, mock.Anything, mock.Anything).Return(nil, errors.New("db"))

	added, err := svc.AddMembers(testSenderTel, testGroupID,
		models.GroupAddMembers{Members: []string{"+34600000011"}}, context.Background())

	assert.Nil(t, added)
	assert.EqualError(t, err, "db")
}

// LeaveGroup debe persistir el evento member_left con el teléfono del que sale
// como target, dentro de la transacción del repo.
func TestLeaveGroup_PersistsMemberLeftSystemMessage(t *testing.T) {
	svc, repo, contacts := newGroupServiceForSend()
	contacts.On("GetIdByTelephon", testSenderTel, mock.Anything).Return(testSenderID, nil)
	repo.On("IsMember", testGroupID, uint(testSenderID), mock.Anything).Return(true, nil)
	repo.On("LeaveGroup", testGroupID, uint(testSenderID), mock.MatchedBy(func(m *models.GroupMessage) bool {
		return m != nil &&
			m.Kind == models.GroupMessageKindSystem &&
			m.SystemEvent == models.SystemEventMemberLeft &&
			m.GroupID == testGroupID &&
			m.SenderID == uint(testSenderID) &&
			len(m.SystemTargets) == 1 && m.SystemTargets[0] == testSenderTel
	}), mock.Anything).Return(nil)

	require.NoError(t, svc.LeaveGroup(testSenderTel, testGroupID, context.Background()))
	repo.AssertExpectations(t)
}

// Un mensaje de sistema no puede ser objetivo de una respuesta.
func TestSendGroupMessage_ReplyToSystemMessageRejected(t *testing.T) {
	svc, repo, contacts := newGroupServiceForSend()
	contacts.On("GetIdByTelephon", testSenderTel, mock.Anything).Return(testSenderID, nil)
	repo.On("IsMember", testGroupID, uint(testSenderID), mock.Anything).Return(true, nil)
	replyTo := uint(55)
	repo.On("GetGroupMessageByID", replyTo, mock.Anything).Return(&models.GroupMessage{
		Model: gorm.Model{ID: replyTo}, GroupID: testGroupID, Kind: models.GroupMessageKindSystem,
	}, nil)

	resp, err := svc.SendGroupMessage(testSenderTel, models.GroupMessageSend{
		GroupID: testGroupID, Message: "hola", ReplyToMessageID: &replyTo,
	}, context.Background())

	assert.Nil(t, resp)
	assert.EqualError(t, err, "no puedes responder a un mensaje de sistema")
	repo.AssertNotCalled(t, "CreateGroupMessage", mock.Anything, mock.Anything)
}

// Responder a un mensaje normal sigue permitido.
func TestSendGroupMessage_ReplyToNormalMessageAllowed(t *testing.T) {
	svc, repo, contacts := newGroupServiceForSend()
	contacts.On("GetIdByTelephon", testSenderTel, mock.Anything).Return(testSenderID, nil)
	contacts.On("GetUsernameByTelephon", testSenderTel, mock.Anything).Return("ana", nil)
	repo.On("IsMember", testGroupID, uint(testSenderID), mock.Anything).Return(true, nil)
	replyTo := uint(54)
	repo.On("GetGroupMessageByID", replyTo, mock.Anything).Return(&models.GroupMessage{
		Model: gorm.Model{ID: replyTo}, GroupID: testGroupID, Message: "original",
	}, nil)
	repo.On("CreateGroupMessage", mock.Anything, mock.Anything).Return(nil)

	resp, err := svc.SendGroupMessage(testSenderTel, models.GroupMessageSend{
		GroupID: testGroupID, Message: "hola", ReplyToMessageID: &replyTo,
	}, context.Background())

	require.NoError(t, err)
	require.NotNil(t, resp)
	repo.AssertCalled(t, "CreateGroupMessage", mock.Anything, mock.Anything)
}

// Los mensajes de sistema no tienen acuses (ni Info ni ticks): el endpoint
// responde "no encontrado" sin consultar miembros.
func TestGetGroupMessageReceipts_SystemMessageHasNoReceipts(t *testing.T) {
	svc, repo, contacts := newGroupServiceForSend()
	contacts.On("GetIdByTelephon", testSenderTel, mock.Anything).Return(testSenderID, nil)
	repo.On("IsMember", testGroupID, uint(testSenderID), mock.Anything).Return(true, nil)
	repo.On("GetGroupMessageByID", uint(66), mock.Anything).Return(&models.GroupMessage{
		Model: gorm.Model{ID: 66}, GroupID: testGroupID, SenderID: uint(testSenderID),
		Kind: models.GroupMessageKindSystem,
	}, nil)

	got, err := svc.GetGroupMessageReceipts(testSenderTel, testGroupID, 66, context.Background())

	assert.Nil(t, got)
	assert.True(t, errors.Is(err, ErrGroupMessageNotFound))
	repo.AssertNotCalled(t, "GetGroupMembers", mock.Anything, mock.Anything)
}

// El historial SÍ incluye los mensajes de sistema, con su Kind/SystemEvent/
// SystemTargets, y respeta la paginación.
func TestGetGroupMessagesPage_KeepsSystemRowsInHistory(t *testing.T) {
	svc, repo, contacts := newGroupServiceForSend()
	contacts.On("GetIdByTelephon", testSenderTel, mock.Anything).Return(testSenderID, nil)
	repo.On("IsMember", testGroupID, uint(testSenderID), mock.Anything).Return(true, nil)

	sys := models.GroupMessage{
		Model: gorm.Model{ID: 8}, GroupID: testGroupID, SenderID: 11,
		Kind: models.GroupMessageKindSystem, SystemEvent: models.SystemEventMemberAdded,
		SystemTargets: []string{"+34600000011"},
		Sender:        models.UserDataBase{User: models.User{Telephon: "+34600000011", Username: "ana"}},
	}
	normal := models.GroupMessage{
		Model: gorm.Model{ID: 7}, GroupID: testGroupID, SenderID: 11, Message: "hola",
		Sender: models.UserDataBase{User: models.User{Telephon: "+34600000011", Username: "ana"}},
	}
	repo.On("GetGroupMessagesPage", testGroupID, uint(0), 50, 0, mock.Anything).
		Return([]models.GroupMessage{sys, normal}, true, nil)

	msgs, hasMore, err := svc.GetGroupMessagesPage(testSenderTel, testGroupID, 0, 50, 0, context.Background())

	require.NoError(t, err)
	assert.True(t, hasMore)
	require.Len(t, msgs, 2)
	assert.Equal(t, uint(8), msgs[0].MessageID)
	assert.Equal(t, models.GroupMessageKindSystem, msgs[0].Kind)
	assert.Equal(t, models.SystemEventMemberAdded, msgs[0].SystemEvent)
	assert.Equal(t, []string{"+34600000011"}, msgs[0].SystemTargets)
	assert.Empty(t, msgs[1].Kind)
}
