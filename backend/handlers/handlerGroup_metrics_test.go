package handlers

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"gorm/backend/metrics"
	"gorm/backend/models"
	"gorm/backend/schemas"
	"gorm/backend/services"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus/testutil"
	"github.com/stretchr/testify/assert"
)

// stubSendGroupService implementa solo SendGroupMessage; el resto entra por la
// interfaz embebida (nil) y no debe invocarse.
type stubSendGroupService struct {
	services.GroupServicer
	err error
}

func (s *stubSendGroupService) SendGroupMessage(string, models.GroupMessageSend, context.Context) (*schemas.GroupMessageResponse, error) {
	if s.err != nil {
		return nil, s.err
	}
	return &schemas.GroupMessageResponse{GroupID: 7}, nil
}

func runSendGroupMessage(svc services.GroupServicer, m *metrics.Metrics) *httptest.ResponseRecorder {
	gin.SetMode(gin.TestMode)
	h := InitHandlerGroup(svc, nil, m)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/group/7/message", nil)
	c.Set("telephon", "123")
	c.Set("groupID", uint(7))
	c.Set("groupMessage", models.GroupMessageSend{GroupID: 7, Message: "hola"})
	h.HandleSendGroupMessage()(c)
	return w
}

// El envío REST de grupo cuenta como enviado tras persistir correctamente.
func TestHandleSendGroupMessageCountsSent(t *testing.T) {
	m := metrics.New(metrics.NewRegistry())

	w := runSendGroupMessage(&stubSendGroupService{}, m)

	assert.Equal(t, http.StatusCreated, w.Code)
	assert.Equal(t, 1.0, testutil.ToFloat64(m.MessagesSentTotal.WithLabelValues(metrics.KindGroup)))
	assert.Equal(t, 0.0, testutil.ToFloat64(m.MessagesFailedTotal.WithLabelValues(metrics.KindGroup)))
}

// Un fallo del servicio cuenta como fallido y no como enviado.
func TestHandleSendGroupMessageCountsFailed(t *testing.T) {
	m := metrics.New(metrics.NewRegistry())

	w := runSendGroupMessage(&stubSendGroupService{err: errors.New("db caída")}, m)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Equal(t, 1.0, testutil.ToFloat64(m.MessagesFailedTotal.WithLabelValues(metrics.KindGroup)))
	assert.Equal(t, 0.0, testutil.ToFloat64(m.MessagesSentTotal.WithLabelValues(metrics.KindGroup)))
}
