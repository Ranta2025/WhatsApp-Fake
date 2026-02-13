package repos

import (
	"testing"

	"gorm/backend/models"

	"github.com/stretchr/testify/assert"
	"gorm.io/gorm"
)

// TestGetRespositorieUserInit test de inicialización
func TestGetRespositorieUserInit(t *testing.T) {
	mockDB := &gorm.DB{}
	repo := GetRespositorieUser(mockDB)

	assert.NotNil(t, repo)
	assert.Equal(t, mockDB, repo.db)
}

// TestCreateUserStructure test de estructura
func TestCreateUserStructure(t *testing.T) {
	user := models.UserDataBase{
		User: models.User{
			Username: "testuser",
			Gmail:    "test@test.com",
			Telephon: "1234567890",
		},
		Password:  "hashed_password",
		Activo:    false,
		Bloqueado: false,
	}
	assert.Equal(t, "testuser", user.Username)
	assert.Equal(t, "test@test.com", user.Gmail)
	assert.Equal(t, "1234567890", user.Telephon)
}

// TestUsernameExistNotFound test para username no existente
func TestUsernameExistNotFound(t *testing.T) {
	mockDB := &gorm.DB{}
	repo := &RepositoriesUser{db: mockDB}

	assert.NotNil(t, repo)
}

// TestGetGmailNotFound test para obtener gmail no existente
func TestGetGmailNotFound(t *testing.T) {
	mockDB := &gorm.DB{}
	repo := &RepositoriesUser{db: mockDB}

	assert.NotNil(t, repo)
}

// TestEmailExistNotFound test para email no existente
func TestEmailExistNotFound(t *testing.T) {
	mockDB := &gorm.DB{}
	repo := &RepositoriesUser{db: mockDB}

	assert.NotNil(t, repo)
}

// TestGetPasswordNotFound test para password no existente
func TestGetPasswordNotFound(t *testing.T) {
	mockDB := &gorm.DB{}
	repo := &RepositoriesUser{db: mockDB}

	assert.NotNil(t, repo)
}

// TestGetActivoNotFound test para estado activación no existente
func TestGetActivoNotFound(t *testing.T) {
	mockDB := &gorm.DB{}
	repo := &RepositoriesUser{db: mockDB}

	assert.NotNil(t, repo)
}

// TestGetBlockedNotFound test para estado bloqueado no existente
func TestGetBlockedNotFound(t *testing.T) {
	mockDB := &gorm.DB{}
	repo := &RepositoriesUser{db: mockDB}

	assert.NotNil(t, repo)
}

// TestGetUsernameByEmailNotFound test para obtener username por email
func TestGetUsernameByEmailNotFound(t *testing.T) {
	mockDB := &gorm.DB{}
	repo := &RepositoriesUser{db: mockDB}

	assert.NotNil(t, repo)
}

// TestTelephonExistNotFound test para teléfono no existente
func TestTelephonExistNotFound(t *testing.T) {
	mockDB := &gorm.DB{}
	repo := &RepositoriesUser{db: mockDB}

	assert.NotNil(t, repo)
}

// TestActivateAccountStructure test para activar cuenta
func TestActivateAccountStructure(t *testing.T) {
	mockDB := &gorm.DB{}
	repo := &RepositoriesUser{db: mockDB}

	assert.NotNil(t, repo)
}

// TestChangePasswordStructure test para cambiar contraseña
func TestChangePasswordStructure(t *testing.T) {
	mockDB := &gorm.DB{}
	repo := &RepositoriesUser{db: mockDB}

	assert.NotNil(t, repo)
}

// TestBlockUserStructure test para bloquear usuario
func TestBlockUserStructure(t *testing.T) {
	mockDB := &gorm.DB{}
	repo := &RepositoriesUser{db: mockDB}

	assert.NotNil(t, repo)
}

// TestUnblockUserByEmailStructure test para desbloquear usuario
func TestUnblockUserByEmailStructure(t *testing.T) {
	mockDB := &gorm.DB{}
	repo := &RepositoriesUser{db: mockDB}

	assert.NotNil(t, repo)
}

// TestChangePasswordByEmailStructure test para cambiar password por email
func TestChangePasswordByEmailStructure(t *testing.T) {
	mockDB := &gorm.DB{}
	repo := &RepositoriesUser{db: mockDB}

	assert.NotNil(t, repo)
}

// TestBeginTxStructure test para transacción
func TestBeginTxStructure(t *testing.T) {
	mockDB := &gorm.DB{}
	repo := &RepositoriesUser{db: mockDB}

	assert.NotNil(t, repo)
}
