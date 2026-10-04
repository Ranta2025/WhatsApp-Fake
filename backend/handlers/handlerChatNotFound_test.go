package handlers

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"gorm/backend/models"
	"gorm/backend/schemas"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
)

// Edit, borrar para mí y responder a un mensaje inexistente/expirado/ajeno
// deben dar 404; cualquier otro error del servicio sigue siendo 500.
func TestHandlerChat1to1NotFoundMapping(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want int
	}{
		{"not found", models.ErrMessageNotFound, http.StatusNotFound},
		{"wrapped not found", errors.Join(errors.New("ctx"), models.ErrMessageNotFound), http.StatusNotFound},
		{"other error", errors.New("boom"), http.StatusInternalServerError},
	}
	for _, tc := range cases {
		t.Run("edit/"+tc.name, func(t *testing.T) {
			svc := new(MockChatService)
			svc.On("ServiceEditMessage", "1", uint(9), "x", mock.Anything).Return(schemas.Message{}, tc.err)
			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)
			c.Request = httptest.NewRequest("PUT", "/chat/edit", nil)
			c.Set("telephon", "1")
			c.Set("messageEdit", models.MessageEdit{MessageID: 9, Message: "x"})
			(&HandlerChat{service: svc}).HandlerEditMessage()(c)
			assert.Equal(t, tc.want, w.Code)
		})
		t.Run("delete-for-me/"+tc.name, func(t *testing.T) {
			svc := new(MockChatService)
			svc.On("ServiceDeleteMessageForMe", "1", uint(9), mock.Anything).Return(schemas.Message{}, tc.err)
			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)
			c.Request = httptest.NewRequest("DELETE", "/message/9/me", nil)
			c.Set("telephon", "1")
			c.Set("messageID", uint(9))
			(&HandlerChat{service: svc}).HandlerDeleteMessageForMe()(c)
			assert.Equal(t, tc.want, w.Code)
		})
		t.Run("post/"+tc.name, func(t *testing.T) {
			svc := new(MockChatService)
			msgGet := models.MessageGet{Receptor: "2", Message: "hi"}
			svc.On("ServiceCreatMessage", models.MessageCreat{MessageGet: msgGet, Telephon: "1"}, mock.Anything).Return(schemas.Message{}, tc.err)
			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)
			c.Request = httptest.NewRequest("POST", "/chat", nil)
			c.Set("telephon", "1")
			c.Set("message", msgGet)
			(&HandlerChat{service: svc}).HandlerPostChat()(c)
			assert.Equal(t, tc.want, w.Code)
		})
	}
}
