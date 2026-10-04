package services

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"gorm/backend/config"
	"gorm/backend/models"
	"gorm/backend/schemas"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

const pushTel = "+51999000111"

var enabledPushCfg = config.PushConfig{Enabled: true, PublicKey: "BPub", PrivateKey: "priv", Subject: "mailto:a@b.c", Preview: true}

func validPushInput(endpoint string) models.PushSubscriptionInput {
	p := make([]byte, 65)
	p[0] = 4
	return models.PushSubscriptionInput{
		Endpoint: endpoint,
		Keys: models.PushSubscriptionKeys{
			P256dh: base64.RawURLEncoding.EncodeToString(p),
			Auth:   base64.RawURLEncoding.EncodeToString(make([]byte, 16)),
		},
	}
}

func subsFor(userID uint, n int) []models.PushSubscription {
	out := make([]models.PushSubscription, n)
	for i := range out {
		out[i] = models.PushSubscription{ID: uint(i + 1), UserID: userID, Endpoint: fmt.Sprintf("https://fcm.googleapis.com/fcm/send/%d", i)}
	}
	return out
}

func TestPushConfigDisabledSkipsRepo(t *testing.T) {
	repo := new(MockPushRepo)
	svc := InitServicePush(config.PushConfig{Preview: true}, repo)

	got, err := svc.Config(pushTel, context.Background())
	require.NoError(t, err)
	assert.Equal(t, schemas.PushConfigResponse{Enabled: false, PublicKey: "", Preview: false}, got)
	repo.AssertNotCalled(t, "GetIdByTelephon", mock.Anything, mock.Anything)
}

func TestPushConfigEnabledCombinesGlobalAndUserPreview(t *testing.T) {
	cases := []struct {
		name          string
		global        bool
		userDisabled  bool
		expectPreview bool
	}{
		{"ambos activos", true, false, true},
		{"usuario la desactiva", true, true, false},
		{"global off", false, false, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			cfg := enabledPushCfg
			cfg.Preview = tc.global
			repo := new(MockPushRepo)
			repo.On("GetIdByTelephon", pushTel, mock.Anything).Return(7, nil)
			repo.On("GetPushPreviewDisabled", uint(7), mock.Anything).Return(tc.userDisabled, nil)

			got, err := InitServicePush(cfg, repo).Config(pushTel, context.Background())
			require.NoError(t, err)
			assert.Equal(t, schemas.PushConfigResponse{Enabled: true, PublicKey: "BPub", Preview: tc.expectPreview}, got)
		})
	}
}

func TestPushSubscribeDisabled(t *testing.T) {
	repo := new(MockPushRepo)
	_, err := InitServicePush(config.PushConfig{}, repo).Subscribe(pushTel, validPushInput("https://fcm.googleapis.com/x"), "ua", context.Background())
	assert.ErrorIs(t, err, ErrPushDisabled)
	repo.AssertNotCalled(t, "UpsertSubscription", mock.Anything, mock.Anything)
}

func TestPushSubscribeInvalidInput(t *testing.T) {
	repo := new(MockPushRepo)
	svc := InitServicePush(enabledPushCfg, repo)
	bad := validPushInput("https://fcm.googleapis.com.evil.com/x")
	_, err := svc.Subscribe(pushTel, bad, "ua", context.Background())
	assert.ErrorIs(t, err, ErrPushInvalid)

	bad = validPushInput("https://fcm.googleapis.com/x")
	bad.Keys.Auth = ""
	_, err = svc.Subscribe(pushTel, bad, "ua", context.Background())
	assert.ErrorIs(t, err, ErrPushInvalid)
	repo.AssertNotCalled(t, "UpsertSubscription", mock.Anything, mock.Anything)
}

func TestPushSubscribeNewCreates(t *testing.T) {
	repo := new(MockPushRepo)
	in := validPushInput("https://fcm.googleapis.com/fcm/send/new")
	repo.On("GetIdByTelephon", pushTel, mock.Anything).Return(7, nil)
	repo.On("GetSubscriptionByEndpoint", in.Endpoint, mock.Anything).Return(nil, nil)
	repo.On("ListSubscriptionsByUser", uint(7), mock.Anything).Return(subsFor(7, 3), nil)
	repo.On("UpsertSubscription", mock.MatchedBy(func(s *models.PushSubscription) bool {
		return s.UserID == 7 && s.Endpoint == in.Endpoint && s.P256dh == in.Keys.P256dh && s.Auth == in.Keys.Auth && s.UserAgent == "Firefox"
	}), mock.Anything).Return(nil)

	created, err := InitServicePush(enabledPushCfg, repo).Subscribe(pushTel, in, "Firefox", context.Background())
	require.NoError(t, err)
	assert.True(t, created)
	repo.AssertExpectations(t)
}

func TestPushSubscribeTruncatesUserAgent(t *testing.T) {
	repo := new(MockPushRepo)
	repo.On("GetIdByTelephon", pushTel, mock.Anything).Return(7, nil)
	repo.On("GetSubscriptionByEndpoint", mock.Anything, mock.Anything).Return(nil, nil)
	repo.On("ListSubscriptionsByUser", uint(7), mock.Anything).Return([]models.PushSubscription{}, nil)
	repo.On("UpsertSubscription", mock.MatchedBy(func(s *models.PushSubscription) bool {
		return len([]rune(s.UserAgent)) == 300
	}), mock.Anything).Return(nil)

	_, err := InitServicePush(enabledPushCfg, repo).Subscribe(pushTel, validPushInput("https://fcm.googleapis.com/x"), strings.Repeat("ñ", 400), context.Background())
	require.NoError(t, err)
	repo.AssertExpectations(t)
}

// Con el límite alcanzado, un endpoint nuevo desplaza a la suscripción más
// antigua por COALESCE(last_success_at, created_at) en vez de bloquear al usuario.
func TestPushSubscribeAtLimitEvictsOldest(t *testing.T) {
	repo := new(MockPushRepo)
	base := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	existing := subsFor(7, MaxPushSubscriptionsPerUser)
	for i := range existing {
		existing[i].CreatedAt = base.Add(time.Duration(i) * time.Hour)
		used := base.Add(time.Duration(100+i) * time.Hour)
		existing[i].LastSuccessAt = &used
	}
	// La fila 4 se creó después de la 0 pero nunca recibió un envío: es la
	// de menor COALESCE(last_success_at, created_at).
	existing[4].LastSuccessAt = nil
	in := validPushInput("https://fcm.googleapis.com/fcm/send/eleventh")
	var calls []string
	repo.On("GetIdByTelephon", pushTel, mock.Anything).Return(7, nil)
	repo.On("GetSubscriptionByEndpoint", in.Endpoint, mock.Anything).Return(nil, nil)
	repo.On("ListSubscriptionsByUser", uint(7), mock.Anything).Return(existing, nil)
	repo.On("DeleteSubscriptionByID", existing[4].ID, mock.Anything).Return(nil).Once().
		Run(func(mock.Arguments) { calls = append(calls, "delete") })
	repo.On("UpsertSubscription", mock.Anything, mock.Anything).Return(nil).Once().
		Run(func(mock.Arguments) { calls = append(calls, "upsert") })

	created, err := InitServicePush(enabledPushCfg, repo).Subscribe(pushTel, in, "ua", context.Background())
	require.NoError(t, err)
	assert.True(t, created)
	assert.Equal(t, []string{"delete", "upsert"}, calls)
	repo.AssertExpectations(t)
}

func TestPushSubscribeEvictErrorPropagates(t *testing.T) {
	repo := new(MockPushRepo)
	boom := errors.New("db caída")
	repo.On("GetIdByTelephon", pushTel, mock.Anything).Return(7, nil)
	repo.On("GetSubscriptionByEndpoint", mock.Anything, mock.Anything).Return(nil, nil)
	repo.On("ListSubscriptionsByUser", uint(7), mock.Anything).Return(subsFor(7, MaxPushSubscriptionsPerUser), nil)
	repo.On("DeleteSubscriptionByID", mock.Anything, mock.Anything).Return(boom)

	_, err := InitServicePush(enabledPushCfg, repo).Subscribe(pushTel, validPushInput("https://fcm.googleapis.com/fcm/send/eleventh"), "ua", context.Background())
	assert.ErrorIs(t, err, boom)
	repo.AssertNotCalled(t, "UpsertSubscription", mock.Anything, mock.Anything)
}

// Un endpoint de otro usuario solo se reasigna si las claves coinciden (mismo
// navegador compartido); si no, es un intento de quedarse con el endpoint.
func TestPushSubscribeOtherUsersEndpointWithDifferentKeysConflicts(t *testing.T) {
	repo := new(MockPushRepo)
	in := validPushInput("https://fcm.googleapis.com/fcm/send/ajeno")
	repo.On("GetIdByTelephon", pushTel, mock.Anything).Return(7, nil)
	repo.On("GetSubscriptionByEndpoint", in.Endpoint, mock.Anything).Return(&models.PushSubscription{ID: 3, UserID: 99, Endpoint: in.Endpoint, P256dh: "otra", Auth: in.Keys.Auth}, nil)
	repo.On("ListSubscriptionsByUser", uint(7), mock.Anything).Return([]models.PushSubscription{}, nil).Maybe()

	_, err := InitServicePush(enabledPushCfg, repo).Subscribe(pushTel, in, "ua", context.Background())
	assert.ErrorIs(t, err, ErrPushConflict)
	repo.AssertNotCalled(t, "UpsertSubscription", mock.Anything, mock.Anything)
}

func TestPushSubscribeOtherUsersEndpointWithSameKeysIsReassigned(t *testing.T) {
	repo := new(MockPushRepo)
	in := validPushInput("https://fcm.googleapis.com/fcm/send/compartido")
	repo.On("GetIdByTelephon", pushTel, mock.Anything).Return(7, nil)
	repo.On("GetSubscriptionByEndpoint", in.Endpoint, mock.Anything).Return(&models.PushSubscription{ID: 3, UserID: 99, Endpoint: in.Endpoint, P256dh: in.Keys.P256dh, Auth: in.Keys.Auth}, nil)
	repo.On("ListSubscriptionsByUser", uint(7), mock.Anything).Return(subsFor(7, 2), nil)
	repo.On("UpsertSubscription", mock.MatchedBy(func(s *models.PushSubscription) bool {
		return s.UserID == 7 && s.Endpoint == in.Endpoint
	}), mock.Anything).Return(nil)

	created, err := InitServicePush(enabledPushCfg, repo).Subscribe(pushTel, in, "ua", context.Background())
	require.NoError(t, err)
	assert.True(t, created, "es nueva para este usuario")
	repo.AssertExpectations(t)
}

func TestPushSubscribeOwnEndpointAtLimitIsUpdate(t *testing.T) {
	repo := new(MockPushRepo)
	existing := subsFor(7, MaxPushSubscriptionsPerUser)
	in := validPushInput(existing[4].Endpoint)
	// La fila guardada tiene claves viejas: el mismo usuario puede rotarlas.
	stored := existing[4]
	stored.P256dh, stored.Auth = "vieja", "vieja"
	repo.On("GetIdByTelephon", pushTel, mock.Anything).Return(7, nil)
	repo.On("GetSubscriptionByEndpoint", in.Endpoint, mock.Anything).Return(&stored, nil)
	repo.On("ListSubscriptionsByUser", uint(7), mock.Anything).Return(existing, nil).Maybe()
	repo.On("UpsertSubscription", mock.MatchedBy(func(s *models.PushSubscription) bool {
		return s.UserID == 7 && s.P256dh == in.Keys.P256dh && s.Auth == in.Keys.Auth
	}), mock.Anything).Return(nil)

	created, err := InitServicePush(enabledPushCfg, repo).Subscribe(pushTel, in, "ua", context.Background())
	require.NoError(t, err)
	assert.False(t, created, "re-suscribir el propio endpoint no cuenta como nueva")
	repo.AssertNotCalled(t, "DeleteSubscriptionByID", mock.Anything, mock.Anything)
	repo.AssertExpectations(t)
}

func TestPushSubscribeRepoErrorPropagates(t *testing.T) {
	repo := new(MockPushRepo)
	boom := errors.New("db caída")
	repo.On("GetIdByTelephon", pushTel, mock.Anything).Return(7, nil)
	repo.On("GetSubscriptionByEndpoint", mock.Anything, mock.Anything).Return(nil, nil).Maybe()
	repo.On("ListSubscriptionsByUser", uint(7), mock.Anything).Return([]models.PushSubscription(nil), boom)

	_, err := InitServicePush(enabledPushCfg, repo).Subscribe(pushTel, validPushInput("https://fcm.googleapis.com/x"), "ua", context.Background())
	assert.ErrorIs(t, err, boom)

	repo = new(MockPushRepo)
	repo.On("GetIdByTelephon", pushTel, mock.Anything).Return(7, nil)
	repo.On("GetSubscriptionByEndpoint", mock.Anything, mock.Anything).Return(nil, boom)
	repo.On("ListSubscriptionsByUser", uint(7), mock.Anything).Return([]models.PushSubscription{}, nil).Maybe()

	_, err = InitServicePush(enabledPushCfg, repo).Subscribe(pushTel, validPushInput("https://fcm.googleapis.com/x"), "ua", context.Background())
	assert.ErrorIs(t, err, boom)
	assert.NotErrorIs(t, err, ErrPushConflict)
}

func TestPushUnsubscribeIsIdempotentAndWorksWhenDisabled(t *testing.T) {
	for _, cfg := range []config.PushConfig{enabledPushCfg, {}} {
		repo := new(MockPushRepo)
		repo.On("GetIdByTelephon", pushTel, mock.Anything).Return(7, nil)
		repo.On("DeleteSubscriptionByEndpoint", uint(7), "https://fcm.googleapis.com/x", mock.Anything).Return(nil).Twice()

		svc := InitServicePush(cfg, repo)
		require.NoError(t, svc.Unsubscribe(pushTel, "https://fcm.googleapis.com/x", context.Background()))
		require.NoError(t, svc.Unsubscribe(pushTel, "https://fcm.googleapis.com/x", context.Background()))
		repo.AssertExpectations(t)
	}
}

func TestPushSetPreview(t *testing.T) {
	repo := new(MockPushRepo)
	repo.On("GetIdByTelephon", pushTel, mock.Anything).Return(7, nil)
	repo.On("SetPushPreviewDisabled", uint(7), true, mock.Anything).Return(nil).Once()
	repo.On("SetPushPreviewDisabled", uint(7), false, mock.Anything).Return(nil).Once()

	svc := InitServicePush(enabledPushCfg, repo)
	require.NoError(t, svc.SetPreview(pushTel, false, context.Background()))
	require.NoError(t, svc.SetPreview(pushTel, true, context.Background()))
	repo.AssertExpectations(t)
}

func TestPushSetPreviewDisabled(t *testing.T) {
	repo := new(MockPushRepo)
	err := InitServicePush(config.PushConfig{}, repo).SetPreview(pushTel, true, context.Background())
	assert.ErrorIs(t, err, ErrPushDisabled)
}
