package websocket

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"testing"

	"gorm/backend/models"
	"gorm/backend/schemas"
	"gorm/backend/services"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const wsLeakyText = "buscar id de usuario: ERROR: relation \"secret_table\" does not exist (SQLSTATE 42P01)"

type failingGroupSend struct {
	services.GroupServicer
	err error
}

func (f *failingGroupSend) SendGroupMessage(string, models.GroupMessageSend, context.Context) (*schemas.GroupMessageResponse, error) {
	return nil, f.err
}

func errorFrame(t *testing.T, frames [][]byte) string {
	t.Helper()
	require.Len(t, frames, 1)
	var env struct {
		Type  string `json:"type"`
		Error string `json:"error"`
	}
	require.NoError(t, json.Unmarshal(frames[0], &env))
	require.Equal(t, "error", env.Type)
	return env.Error
}

func sendDirect(t *testing.T, err error) string {
	t.Helper()
	h, sender, _ := directHarness(&fakeIdemChatService{err: err})
	NewMessageHandler(sender, h, json.RawMessage(`{"receptor":"+2","message":"hola","clientID":"`+wsTestClientID+`"}`)).HandleChatMessage()
	return errorFrame(t, drain(sender))
}

func TestWSError_InternalCauseIsNotSentButPrefixIsKept(t *testing.T) {
	msg := sendDirect(t, fmt.Errorf("wrap: %w", errors.New(wsLeakyText)))
	assert.Contains(t, msg, "Error al enviar mensaje")
	assert.NotContains(t, msg, "secret_table")
	assert.NotContains(t, msg, "SQLSTATE")
	assert.NotRegexp(t, "(?i)clientid", msg, "un error interno no debe parecer permanente para el outbox")
}

func TestWSError_ClientIDErrorsStayPermanentForTheOutbox(t *testing.T) {
	for _, err := range []error{services.ErrInvalidClientID, services.ErrClientIDConflict} {
		msg := sendDirect(t, err)
		assert.Equal(t, "Error al enviar mensaje: "+err.Error(), msg)
		assert.Regexp(t, "(?i)clientid", msg)
	}
}

func TestWSError_GroupSend(t *testing.T) {
	run := func(err error) string {
		h := newTestHub()
		sender := NewClient("ana", "+1", nil)
		sender.ServiceGroup = &failingGroupSend{err: err}
		h.RegisterClient(sender)
		NewMessageHandler(sender, h, json.RawMessage(`{"groupID":7,"message":"hola"}`)).HandleGroupChatMessage()
		return errorFrame(t, drain(sender))
	}

	internal := run(fmt.Errorf("x: %w", &pgconn.PgError{Code: "42P01", Message: "secret_table"}))
	assert.Contains(t, internal, "Error al enviar mensaje al grupo")
	assert.NotContains(t, internal, "secret_table")

	assert.Equal(t, "Error al enviar mensaje al grupo: no eres miembro de este grupo", run(services.ErrNotGroupMember))
	assert.Equal(t, "Error al enviar mensaje al grupo: el mensaje no puede estar vacío", run(errors.New("el mensaje no puede estar vacío")))
}
