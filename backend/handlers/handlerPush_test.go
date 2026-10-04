package handlers

import (
	"encoding/json"
	"errors"
	"gorm/backend/models"
	"gorm/backend/schemas"
	"gorm/backend/services"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

const pushTestTel = "+51999000111"

func pushCtx(method string, sets map[string]any) (*httptest.ResponseRecorder, *gin.Context) {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(method, "/push", nil)
	c.Request.Header.Set("User-Agent", "Firefox/130")
	for k, v := range sets {
		c.Set(k, v)
	}
	return w, c
}

func TestInitHandlerPush(t *testing.T) {
	assert.NotNil(t, InitHandlerPush(nil))
}

func TestHandlerPushConfigCamelCase(t *testing.T) {
	svc := new(MockPushService)
	svc.On("Config", pushTestTel, mock.Anything).Return(schemas.PushConfigResponse{Enabled: true, PublicKey: "BPub", Preview: true}, nil)
	w, c := pushCtx("GET", map[string]any{"telephon": pushTestTel})

	InitHandlerPush(svc).HandlerGetPushConfig()(c)

	require.Equal(t, http.StatusOK, w.Code)
	var got map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &got))
	assert.Equal(t, map[string]any{"enabled": true, "publicKey": "BPub", "preview": true}, got)
}

func TestHandlerPushConfigDisabled(t *testing.T) {
	svc := new(MockPushService)
	svc.On("Config", pushTestTel, mock.Anything).Return(schemas.PushConfigResponse{}, nil)
	w, c := pushCtx("GET", map[string]any{"telephon": pushTestTel})

	InitHandlerPush(svc).HandlerGetPushConfig()(c)

	require.Equal(t, http.StatusOK, w.Code)
	assert.JSONEq(t, `{"enabled":false,"publicKey":"","preview":false}`, w.Body.String())
}

func TestHandlerPushConfigInternalError(t *testing.T) {
	svc := new(MockPushService)
	svc.On("Config", pushTestTel, mock.Anything).Return(schemas.PushConfigResponse{}, errors.New("db password=secret"))
	w, c := pushCtx("GET", map[string]any{"telephon": pushTestTel})

	InitHandlerPush(svc).HandlerGetPushConfig()(c)

	assert.Equal(t, http.StatusInternalServerError, w.Code)
	assert.NotContains(t, w.Body.String(), "secret")
}

func TestHandlerPushMissingTelephon(t *testing.T) {
	h := InitHandlerPush(nil)
	for _, fn := range []gin.HandlerFunc{h.HandlerGetPushConfig(), h.HandlerSubscribe(), h.HandlerUnsubscribe(), h.HandlerSetPreview()} {
		w, c := pushCtx("POST", nil)
		fn(c)
		assert.Equal(t, http.StatusBadRequest, w.Code)
	}
}

func TestHandlerPushSubscribeStatuses(t *testing.T) {
	sub := models.PushSubscriptionInput{Endpoint: "https://fcm.googleapis.com/x"}
	cases := []struct {
		name    string
		created bool
		err     error
		want    int
	}{
		{"nueva", true, nil, http.StatusCreated},
		{"existente", false, nil, http.StatusOK},
		{"deshabilitado", false, services.ErrPushDisabled, http.StatusNotFound},
		{"límite", false, services.ErrPushLimit, http.StatusConflict},
		{"inválida", false, services.ErrPushInvalid, http.StatusBadRequest},
		{"interno", false, errors.New("boom"), http.StatusInternalServerError},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			svc := new(MockPushService)
			svc.On("Subscribe", pushTestTel, sub, "Firefox/130", mock.Anything).Return(tc.created, tc.err)
			w, c := pushCtx("POST", map[string]any{"telephon": pushTestTel, "pushSubscription": sub})

			InitHandlerPush(svc).HandlerSubscribe()(c)

			assert.Equal(t, tc.want, w.Code, w.Body.String())
			svc.AssertExpectations(t)
		})
	}
}

func TestHandlerPushUnsubscribe(t *testing.T) {
	svc := new(MockPushService)
	svc.On("Unsubscribe", pushTestTel, "https://fcm.googleapis.com/x", mock.Anything).Return(nil)
	w, c := pushCtx("DELETE", map[string]any{"telephon": pushTestTel, "pushEndpoint": "https://fcm.googleapis.com/x"})

	InitHandlerPush(svc).HandlerUnsubscribe()(c)

	assert.Equal(t, http.StatusNoContent, w.Code)
	assert.Empty(t, w.Body.String())
}

func TestHandlerPushUnsubscribeError(t *testing.T) {
	svc := new(MockPushService)
	svc.On("Unsubscribe", pushTestTel, "e", mock.Anything).Return(errors.New("boom"))
	w, c := pushCtx("DELETE", map[string]any{"telephon": pushTestTel, "pushEndpoint": "e"})

	InitHandlerPush(svc).HandlerUnsubscribe()(c)

	assert.Equal(t, http.StatusInternalServerError, w.Code)
}

func TestHandlerPushSetPreview(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want int
	}{
		{"ok", nil, http.StatusNoContent},
		{"deshabilitado", services.ErrPushDisabled, http.StatusNotFound},
		{"interno", errors.New("boom"), http.StatusInternalServerError},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			svc := new(MockPushService)
			svc.On("SetPreview", pushTestTel, false, mock.Anything).Return(tc.err)
			w, c := pushCtx("PUT", map[string]any{"telephon": pushTestTel, "pushPreview": false})

			InitHandlerPush(svc).HandlerSetPreview()(c)

			assert.Equal(t, tc.want, w.Code)
			svc.AssertExpectations(t)
		})
	}
}
