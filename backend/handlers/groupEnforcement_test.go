package handlers

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"gorm/backend/models"
	"gorm/backend/schemas"
	"gorm/backend/services"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

// ─────────────────────────────────────────────────────────────────────────────
// GA4: los handlers traducen los errores tipados de restricción a 403.
// ─────────────────────────────────────────────────────────────────────────────

type stubEnforcementService struct {
	services.GroupServicer
	addErr    error
	sendErr   error
	editErr   error
	avatarErr error
}

func (s *stubEnforcementService) AddMembers(string, uint, models.GroupAddMembers, context.Context) ([]schemas.GroupMemberBrief, *schemas.GroupMessageResponse, error) {
	return nil, nil, s.addErr
}

func (s *stubEnforcementService) SendGroupMessage(string, models.GroupMessageSend, context.Context) (*schemas.GroupMessageResponse, error) {
	return nil, s.sendErr
}

func (s *stubEnforcementService) EditGroupMessage(string, uint, models.GroupMessageEdit, context.Context) (*schemas.GroupMessageResponse, error) {
	return nil, s.editErr
}

func (s *stubEnforcementService) UpdateGroupAvatar(string, uint, string, context.Context) error {
	return s.avatarErr
}

func newEnforcementContext(stub *stubEnforcementService, method, path, body string) (*gin.Context, *httptest.ResponseRecorder) {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(method, path, strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("telephon", "+1")
	c.Set("groupID", uint(7))
	return c, w
}

func TestHandleAddMembers_ErrorMapping(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want int
	}{
		{"restringido a admins", services.ErrGroupAddRestricted, http.StatusForbidden},
		{"no miembro", services.ErrNotGroupMember, http.StatusForbidden},
		{"error interno", errors.New("boom"), http.StatusBadRequest},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			h := &HandlerGroup{service: &stubEnforcementService{addErr: tc.err}}
			c, w := newEnforcementContext(nil, "POST", "/group/7/members", "")
			c.Set("groupAddMembers", models.GroupAddMembers{Members: []string{"+2"}})

			h.HandleAddMembers()(c)

			assert.Equal(t, tc.want, w.Code)
		})
	}
}

func TestHandleSendGroupMessage_ErrorMapping(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want int
	}{
		{"restringido a admins", services.ErrGroupSendRestricted, http.StatusForbidden},
		{"no miembro", services.ErrNotGroupMember, http.StatusForbidden},
		{"error interno", errors.New("boom"), http.StatusBadRequest},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			h := InitHandlerGroup(&stubEnforcementService{sendErr: tc.err}, nil, nil)
			c, w := newEnforcementContext(nil, "POST", "/group/7/message", "")
			c.Set("groupMessage", models.GroupMessageSend{GroupID: 7, Message: "hola"})

			h.HandleSendGroupMessage()(c)

			assert.Equal(t, tc.want, w.Code)
		})
	}
}

func TestHandleEditGroupMessage_ErrorMapping(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want int
	}{
		{"restringido a admins", services.ErrGroupSendRestricted, http.StatusForbidden},
		{"no miembro", services.ErrNotGroupMember, http.StatusForbidden},
		{"error interno", errors.New("boom"), http.StatusBadRequest},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			h := &HandlerGroup{service: &stubEnforcementService{editErr: tc.err}}
			c, w := newEnforcementContext(nil, "PUT", "/group/7/message", "")
			c.Set("groupMessageEdit", models.GroupMessageEdit{MessageID: 3, Message: "editado"})

			h.HandleEditGroupMessage()(c)

			assert.Equal(t, tc.want, w.Code)
		})
	}
}

func TestHandleUpdateGroupAvatar_ErrorMapping(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want int
	}{
		{"restringido a admins", services.ErrGroupEditRestricted, http.StatusForbidden},
		{"no miembro", services.ErrNotGroupMember, http.StatusForbidden},
		{"error interno", errors.New("boom"), http.StatusBadRequest},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			h := &HandlerGroup{service: &stubEnforcementService{avatarErr: tc.err}}
			c, w := newEnforcementContext(nil, "PATCH", "/group/7/avatar", `{"avatarUrl":"/storage/a.png"}`)

			h.HandleUpdateGroupAvatar()(c)

			assert.Equal(t, tc.want, w.Code)
		})
	}
}
