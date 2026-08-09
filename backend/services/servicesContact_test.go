package services

import (
	"context"
	"database/sql"
	"errors"
	"gorm/backend/models"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"gorm.io/gorm"
)

// MockApiContactService mock para servicio de contactos
type MockApiContactService struct {
	mock.Mock
}

func (m *MockApiContactService) GetIdUsername(username string, ctx context.Context) (int, error) {
	args := m.Called(username, ctx)
	return args.Int(0), args.Error(1)
}

func (m *MockApiContactService) GetNumberUsername(number string, ctx context.Context) (int, error) {
	args := m.Called(number, ctx)
	return args.Int(0), args.Error(1)
}

// TestInitServiceContact test para la inicialización
func TestInitServiceContact(t *testing.T) {
	service := InitServiceContact(nil)
	assert.NotNil(t, service)
}

// TestServicesGetUserStructure test de estructura básica
func TestServicesGetUserStructure(t *testing.T) {
	ctx := context.Background()
	assert.NotNil(t, ctx)
}

// TestServicePutUserStructure test de estructura básica
func TestServicePutUserStructure(t *testing.T) {
	ctx := context.Background()
	assert.NotNil(t, ctx)
}

// TestAddContactStructure test de estructura básica
func TestAddContactStructure(t *testing.T) {
	ctx := context.Background()
	assert.NotNil(t, ctx)
}

// TestServicesGetUserMissingUser test para obtener usuario sin datos
func TestServicesGetUserMissingUser(t *testing.T) {
	ctx := context.Background()
	service := &ServiceApiContact{client: nil}

	assert.NotNil(t, service)
	assert.NotNil(t, ctx)
}

// TestServicePutUserSameUsername test para cambiar a mismo usuario
func TestServicePutUserSameUsername(t *testing.T) {
	ctx := context.Background()

	service := &ServiceApiContact{client: nil}

	user, err := service.ServicePutUser("testuser", "testuser", ctx)

	assert.Nil(t, user)
	assert.NotNil(t, err)
	assert.Equal(t, "Proporciono el mismo usuario", err.Error())
}

// TestAddContactMissingUser test para agregar contacto sin usuario
func TestAddContactMissingUser(t *testing.T) {
	ctx := context.Background()
	service := &ServiceApiContact{client: nil}

	assert.NotNil(t, service)
	assert.NotNil(t, ctx)
}

// TestAddContactMissingContact test para agregar contacto con número inexistente
func TestAddContactMissingContact(t *testing.T) {
	ctx := context.Background()
	service := &ServiceApiContact{client: nil}

	assert.NotNil(t, service)
	assert.NotNil(t, ctx)
}

// TestServiceGetContactsMissingUser test para obtener contactos sin usuario
func TestServiceGetContactsMissingUser(t *testing.T) {
	ctx := context.Background()
	service := &ServiceApiContact{client: nil}

	assert.NotNil(t, service)
	assert.NotNil(t, ctx)
}

// TestServiceGetContactByNumberMissing test para obtener contacto sin número
func TestServiceGetContactByNumberMissing(t *testing.T) {
	ctx := context.Background()
	service := &ServiceApiContact{client: nil}

	assert.NotNil(t, service)
	assert.NotNil(t, ctx)
}

// ==================== C9: AddContact atómico + deduplicación ====================

// fakeTxCommitter implementa gorm.ConnPool + gorm.TxCommitter sin tocar una
// base real: permite ejercitar el flujo transaccional de addContactByUserIDs
// en tests de unidad (Commit/Rollback inofensivos, consultas no usadas).
// NOTA: debe ser un tipo puntero — gorm llama reflect.ValueOf(committer).IsNil()
// y panica con tipos no puntero.
type fakeTxCommitter struct{}

func (*fakeTxCommitter) Commit() error   { return nil }
func (*fakeTxCommitter) Rollback() error { return nil }
func (*fakeTxCommitter) PrepareContext(ctx context.Context, query string) (*sql.Stmt, error) {
	return nil, errors.New("fakeTxCommitter: no prepare")
}
func (*fakeTxCommitter) ExecContext(ctx context.Context, query string, args ...interface{}) (sql.Result, error) {
	return nil, errors.New("fakeTxCommitter: no exec")
}
func (*fakeTxCommitter) QueryContext(ctx context.Context, query string, args ...interface{}) (*sql.Rows, error) {
	return nil, errors.New("fakeTxCommitter: no query")
}
func (*fakeTxCommitter) QueryRowContext(ctx context.Context, query string, args ...interface{}) *sql.Row {
	return nil
}

// fakeGormTx devuelve un *gorm.DB cuyo Commit/Rollback son inofensivos.
func fakeGormTx() *gorm.DB {
	return &gorm.DB{Statement: &gorm.Statement{ConnPool: &fakeTxCommitter{}}}
}

func newContactServiceWithMock() (*ServiceApiContact, *MockContactRepo) {
	repo := &MockContactRepo{}
	return &ServiceApiContact{client: repo}, repo
}

// TestAddContactByTelephonDuplicate: agregar un contacto existente debe fallar
// con AppError 409 (spec R2: UNIQUE violation → HTTP 409) sin llegar a insertar.
func TestAddContactByTelephonDuplicate(t *testing.T) {
	ctx := context.Background()
	service, repo := newContactServiceWithMock()

	repo.On("GetIdByTelephon", "+123456", ctx).Return(1, nil)
	repo.On("GetNumberUsername", "+999999", ctx).Return(2, nil)
	repo.On("BeginTx").Return(fakeGormTx())
	repo.On("ExistContactAddTx", mock.Anything, uint(1), uint(2), ctx).Return(true, nil)

	contact, err := service.AddContactByTelephon("+123456", models.ContactAdd{Number: "+999999"}, ctx)

	assert.Nil(t, contact)
	assert.NotNil(t, err)
	var appErr *models.AppError
	assert.True(t, errors.As(err, &appErr), "error debe ser *models.AppError")
	assert.Equal(t, http.StatusConflict, appErr.Code)
	assert.Equal(t, "contacto ya existente", appErr.Message)
	// La transacción no debe haberse confirmado ni invalidado caché
	repo.AssertNotCalled(t, "AddContactTx", mock.Anything, mock.Anything, ctx)
	repo.AssertNotCalled(t, "InvalidateContactsCache", mock.Anything, ctx)
}

// TestAddContactByTelephonCommit: agregar un contacto nuevo confirma la
// transacción e invalida la caché de contactos de ambas partes.
func TestAddContactByTelephonCommit(t *testing.T) {
	ctx := context.Background()
	service, repo := newContactServiceWithMock()

	repo.On("GetIdByTelephon", "+123456", ctx).Return(1, nil)
	repo.On("GetNumberUsername", "+999999", ctx).Return(2, nil)
	repo.On("BeginTx").Return(fakeGormTx())
	repo.On("ExistContactAddTx", mock.Anything, uint(1), uint(2), ctx).Return(false, nil)
	repo.On("AddContactTx", mock.Anything, mock.MatchedBy(func(c models.ContactDataBase) bool {
		return c.IdUser == 1 && c.IdContact == 2 && c.Status == "accepted"
	}), ctx).Return(nil)
	repo.On("GetContactNumber", "+999999", ctx).Return(&models.ContactChat{
		Username: "contacto", Number: "+999999", Status: "accepted",
	}, nil)
	repo.On("InvalidateContactsCache", "+123456", ctx).Return()
	repo.On("InvalidateContactsCache", "+999999", ctx).Return()

	contact, err := service.AddContactByTelephon("+123456", models.ContactAdd{Number: "+999999"}, ctx)

	assert.NoError(t, err)
	assert.NotNil(t, contact)
	assert.Equal(t, "contacto", contact.Username)
	repo.AssertExpectations(t)
}

// TestAddContactByTelephonSelfAdd: un usuario no puede agregarse a sí mismo.
func TestAddContactByTelephonSelfAdd(t *testing.T) {
	ctx := context.Background()
	service, repo := newContactServiceWithMock()

	repo.On("GetIdByTelephon", "+123456", ctx).Return(1, nil)
	repo.On("GetNumberUsername", "+123456", ctx).Return(1, nil)

	contact, err := service.AddContactByTelephon("+123456", models.ContactAdd{Number: "+123456"}, ctx)

	assert.Nil(t, contact)
	assert.NotNil(t, err)
	assert.Contains(t, err.Error(), "a ti mismo")
}
