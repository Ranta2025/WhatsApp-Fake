package models

import (
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm/schema"
)

// AutoMigrate es dueño del índice único del endpoint. Su nombre debe ser el
// mismo que creaba el antiguo CREATE UNIQUE INDEX IF NOT EXISTS, para que en
// bases existentes GORM lo encuentre (HasIndex) y no cree un duplicado.
func TestPushSubscriptionEndpointUniqueIndex(t *testing.T) {
	s, err := schema.Parse(&PushSubscription{}, &sync.Map{}, schema.NamingStrategy{})
	require.NoError(t, err)

	var found *schema.Index
	for _, idx := range s.ParseIndexes() {
		if idx.Name == "idx_push_subscriptions_endpoint" {
			found = idx
		}
	}
	require.NotNil(t, found, "índice idx_push_subscriptions_endpoint")
	assert.Equal(t, "UNIQUE", found.Class)
	require.Len(t, found.Fields, 1)
	assert.Equal(t, "endpoint", found.Fields[0].DBName)
}
