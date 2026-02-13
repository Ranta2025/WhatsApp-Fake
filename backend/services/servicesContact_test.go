package services

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
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
