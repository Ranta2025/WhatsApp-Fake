package repos

import (
	"reflect"
	"strconv"
	"strings"
	"testing"
	"time"

	"gorm/backend/models"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func gormTagOf(t *testing.T, v interface{}, field string) string {
	t.Helper()
	f, ok := reflect.TypeOf(v).FieldByName(field)
	require.True(t, ok, "falta el campo %s", field)
	return f.Tag.Get("gorm")
}

func TestChatSettingPairIsUnique(t *testing.T) {
	low := gormTagOf(t, models.ChatSetting{}, "UserLowID")
	high := gormTagOf(t, models.ChatSetting{}, "UserHighID")
	assert.Contains(t, low, "uniqueIndex:idx_chat_settings_pair")
	assert.Contains(t, high, "uniqueIndex:idx_chat_settings_pair")
	assert.Contains(t, gormTagOf(t, models.ChatSetting{}, "DisappearSeconds"), "default:0")
}

func TestExpiresAtIsNullable(t *testing.T) {
	for _, v := range []interface{}{models.Message{}, models.GroupMessage{}} {
		f, ok := reflect.TypeOf(v).FieldByName("ExpiresAt")
		require.True(t, ok)
		assert.Equal(t, reflect.Ptr, f.Type.Kind(), "%T.ExpiresAt debe ser nullable", v)
	}
}

func TestMessageKindDefaultsEmpty(t *testing.T) {
	assert.Contains(t, gormTagOf(t, models.Message{}, "Kind"), "default:''")
	assert.Contains(t, gormTagOf(t, models.Message{}, "SystemEvent"), "default:''")
	assert.Contains(t, gormTagOf(t, models.Group{}, "DisappearSeconds"), "default:0")
}

func TestMediaGCObjectKeyUnique(t *testing.T) {
	tag := gormTagOf(t, models.MediaGC{}, "ObjectKey")
	assert.Contains(t, tag, "uniqueIndex")
	assert.Contains(t, tag, "not null")
}

func TestPrepareChatSystemMessage(t *testing.T) {
	before := time.Now()
	msg := prepareChatSystemMessage(&models.Message{}, 7, 3, 86400)

	assert.Equal(t, models.MessageKindSystem, msg.Kind)
	assert.Equal(t, models.SystemEventDisappearingChanged, msg.SystemEvent)
	assert.Equal(t, strconv.Itoa(86400), msg.Message)
	assert.Equal(t, uint(7), msg.IdUser, "el remitente es el actor")
	assert.Equal(t, uint(3), msg.IdReceptor)
	// 'visto' para que no cuente como pendiente de entrega ni como no leído.
	assert.Equal(t, "visto", msg.Status)
	assert.False(t, msg.Time.Before(before))
	assert.Nil(t, msg.ExpiresAt, "los mensajes de sistema no expiran")
}

func TestPrepareChatSystemMessage_NilCreatesOne(t *testing.T) {
	msg := prepareChatSystemMessage(nil, 1, 2, 0)
	require.NotNil(t, msg)
	assert.Equal(t, "0", msg.Message)
	assert.True(t, strings.HasPrefix(msg.SystemEvent, "disappearing"))
}
