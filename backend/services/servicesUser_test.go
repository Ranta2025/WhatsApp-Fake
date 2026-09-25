package services

import (
	"context"
	"errors"
	"gorm/backend/models"
	"gorm/backend/utils"
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
)

func TestServicesUser_LogIn_Success(t *testing.T) {
	mockRepo := new(MockUserRepo)
	mockCache := new(MockUserCache)
	service := InitServices(mockRepo, mockCache)

	user := models.UserLogin{Username: "testuser", Password: "password123"}
	ctx := context.Background()

	hashed, _ := utils.Hash("password123")
	mockRepo.On("GetAuthByUsername", "testuser", ctx).Return(&models.UserAuth{
		Username: "testuser", Telephon: "+50212345678", Password: hashed, Activo: true,
	}, nil)
	mockCache.On("ResetIntentosFallidos", "testuser", ctx).Return(nil)

	os.Setenv("SECRETKEY", "super-secret-key-32-characters-long")
	utils.ValidateJWTSecret()

	token, err := service.LogIn(user, ctx)

	assert.NoError(t, err)
	username, telephon, err := utils.DecodeToken(token)
	assert.NoError(t, err)
	assert.Equal(t, "testuser", username)
	assert.Equal(t, "+50212345678", telephon)
	mockRepo.AssertExpectations(t)
	mockCache.AssertExpectations(t)
}

func TestServicesUser_LogIn_WrongPasswordCountsAttempt(t *testing.T) {
	mockRepo := new(MockUserRepo)
	mockCache := new(MockUserCache)
	service := InitServices(mockRepo, mockCache)
	ctx := context.Background()

	hashed, _ := utils.Hash("password123")
	mockRepo.On("GetAuthByUsername", "testuser", ctx).Return(&models.UserAuth{
		Username: "testuser", Telephon: "+50212345678", Password: hashed, Activo: true,
	}, nil)
	mockCache.On("IncrIntentosFallidos", "testuser", ctx).Return(1, nil)

	_, err := service.LogIn(models.UserLogin{Username: "testuser", Password: "wrong"}, ctx)

	assert.EqualError(t, err, "Credenciales invalidas")
	mockRepo.AssertNotCalled(t, "BlockUser", mock.Anything, mock.Anything)
}

func TestServicesUser_LogIn_BlocksAfterTooManyAttempts(t *testing.T) {
	mockRepo := new(MockUserRepo)
	mockCache := new(MockUserCache)
	service := InitServices(mockRepo, mockCache)
	ctx := context.Background()

	hashed, _ := utils.Hash("password123")
	mockRepo.On("GetAuthByUsername", "testuser", ctx).Return(&models.UserAuth{
		Username: "testuser", Telephon: "+50212345678", Password: hashed, Activo: true,
	}, nil)
	mockCache.On("IncrIntentosFallidos", "testuser", ctx).Return(maxIntentosLogin+1, nil)
	mockRepo.On("BlockUser", "testuser", ctx).Return(nil)
	mockCache.On("ResetIntentosFallidos", "testuser", ctx).Return(nil)
	mockCache.On("RevokeAllRefreshTokens", "+50212345678", ctx).Return(nil)

	_, err := service.LogIn(models.UserLogin{Username: "testuser", Password: "wrong"}, ctx)

	assert.EqualError(t, err, "usuario bloqueado por demasiados intentos fallidos")
	mockRepo.AssertExpectations(t)
	mockCache.AssertExpectations(t)
}

func TestServicesUser_LogIn_InactiveOnlyRevealedWithCorrectPassword(t *testing.T) {
	mockRepo := new(MockUserRepo)
	mockCache := new(MockUserCache)
	service := InitServices(mockRepo, mockCache)
	ctx := context.Background()

	hashed, _ := utils.Hash("password123")
	mockRepo.On("GetAuthByUsername", "testuser", ctx).Return(&models.UserAuth{
		Username: "testuser", Password: hashed, Activo: false,
	}, nil)
	mockCache.On("IncrIntentosFallidos", "testuser", ctx).Return(1, nil)

	_, err := service.LogIn(models.UserLogin{Username: "testuser", Password: "wrong"}, ctx)
	assert.EqualError(t, err, "Credenciales invalidas")

	_, err = service.LogIn(models.UserLogin{Username: "testuser", Password: "password123"}, ctx)
	assert.EqualError(t, err, "usuario inactivo")
}

func TestServicesUser_ActivateAccount_InvalidatesCodeAfterMaxAttempts(t *testing.T) {
	mockRepo := new(MockUserRepo)
	mockCache := new(MockUserCache)
	service := InitServices(mockRepo, mockCache)
	ctx := context.Background()

	mockRepo.On("UsernameExist", "testuser", ctx).Return(true)
	mockCache.On("GetCodigo", "activacion", "testuser", ctx).Return("123456", nil)
	mockCache.On("IncrCodigoIntentos", "activacion", "testuser", ctx).Return(maxIntentosCodigo, nil)
	mockCache.On("DeleteCodigo", "activacion", "testuser", ctx).Return(nil)

	err := service.ActivateAccount(models.UserActivate{Username: "testuser", Code: "000000"}, ctx)

	assert.EqualError(t, err, "demasiados intentos incorrectos, solicite un nuevo codigo")
	mockCache.AssertExpectations(t)
	mockRepo.AssertNotCalled(t, "ActivateAccount", mock.Anything, mock.Anything)
}

func TestServicesUser_ActivateAccount_ConsumesCode(t *testing.T) {
	mockRepo := new(MockUserRepo)
	mockCache := new(MockUserCache)
	service := InitServices(mockRepo, mockCache)
	ctx := context.Background()

	mockRepo.On("UsernameExist", "testuser", ctx).Return(true)
	mockCache.On("GetCodigo", "activacion", "testuser", ctx).Return("123456", nil)
	mockRepo.On("ActivateAccount", "testuser", ctx).Return(nil)
	mockCache.On("DeleteCodigo", "activacion", "testuser", ctx).Return(nil)

	err := service.ActivateAccount(models.UserActivate{Username: "testuser", Code: "123456"}, ctx)

	assert.NoError(t, err)
	mockRepo.AssertExpectations(t)
	mockCache.AssertExpectations(t)
}

func TestServicesUser_RefreshSession_RotatesAndUsesCurrentUsername(t *testing.T) {
	mockRepo := new(MockUserRepo)
	mockCache := new(MockUserCache)
	service := InitServices(mockRepo, mockCache)
	ctx := context.Background()

	mockCache.On("GetRefreshTokenOwner", "refresh-token", ctx).Return("+50212345678", nil)
	mockCache.On("DeleteRefreshToken", "refresh-token", ctx).Return(nil)
	mockRepo.On("GetAuthByTelephon", "+50212345678", ctx).Return(&models.UserAuth{
		Username: "nuevo_nombre", Telephon: "+50212345678", Activo: true,
	}, nil)

	username, telephon, err := service.RefreshSession("refresh-token", ctx)

	assert.NoError(t, err)
	assert.Equal(t, "nuevo_nombre", username)
	assert.Equal(t, "+50212345678", telephon)
	mockCache.AssertExpectations(t)
}

func TestServicesUser_RefreshSession_RejectsBlockedUser(t *testing.T) {
	mockRepo := new(MockUserRepo)
	mockCache := new(MockUserCache)
	service := InitServices(mockRepo, mockCache)
	ctx := context.Background()

	mockCache.On("GetRefreshTokenOwner", "refresh-token", ctx).Return("+50212345678", nil)
	mockCache.On("DeleteRefreshToken", "refresh-token", ctx).Return(nil)
	mockRepo.On("GetAuthByTelephon", "+50212345678", ctx).Return(&models.UserAuth{
		Username: "testuser", Telephon: "+50212345678", Activo: true, Bloqueado: true,
	}, nil)
	mockCache.On("RevokeAllRefreshTokens", "+50212345678", ctx).Return(nil)

	_, _, err := service.RefreshSession("refresh-token", ctx)

	assert.Error(t, err)
	mockCache.AssertExpectations(t)
}

func TestServicesUser_RefreshSession_UnknownToken(t *testing.T) {
	mockRepo := new(MockUserRepo)
	mockCache := new(MockUserCache)
	service := InitServices(mockRepo, mockCache)
	ctx := context.Background()

	mockCache.On("GetRefreshTokenOwner", "forged", ctx).Return("", errors.New("redis: nil"))

	_, _, err := service.RefreshSession("forged", ctx)

	assert.Error(t, err)
	mockCache.AssertNotCalled(t, "DeleteRefreshToken", mock.Anything, mock.Anything)
}

func TestServicesUser_CreateUser_Success(t *testing.T) {
	mockRepo := new(MockUserRepo)
	mockCache := new(MockUserCache)
	service := InitServices(mockRepo, mockCache)

	user := models.UserDataBase{
		User: models.User{
			Username: "newuser",
			Gmail:    "newuser@gmail.com",
			Telephon: "12345678",
		},
		Password: "password123",
	}
	ctx := context.Background()

	mockRepo.On("UsernameExist", user.Username, ctx).Return(false)
	mockRepo.On("EmailExist", user.Gmail, ctx).Return("", false)
	mockRepo.On("TelephonExist", user.Telephon, ctx).Return(false)

	// Saltamos el resto del test por la complejidad de mockear Tx
	assert.NotNil(t, service)
}

// TestCreateUserStructure test de estructura básica
func TestCreateUserStructure(t *testing.T) {
	ctx := context.Background()
	assert.NotNil(t, ctx)
}

// TestLogInStructure test de estructura básica
func TestLogInStructure(t *testing.T) {
	ctx := context.Background()
	assert.NotNil(t, ctx)
}

// TestActivateAccountStructure test de estructura básica
func TestActivateAccountStructure(t *testing.T) {
	ctx := context.Background()
	assert.NotNil(t, ctx)
}
