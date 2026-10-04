package services

import (
	"encoding/json"
	"strings"
	"testing"
	"unicode/utf8"

	"gorm/backend/schemas"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func decodePushPayload(t *testing.T, raw []byte) map[string]interface{} {
	t.Helper()
	var m map[string]interface{}
	require.NoError(t, json.Unmarshal(raw, &m))
	return m
}

func TestBuildDirectPushPayload_Contract(t *testing.T) {
	msg := schemas.Message{MessageID: 42, SenderTelephon: "+51999", Receptor: "+51888", Message: "hola"}

	raw, err := BuildDirectPushPayload(msg, "ana", true)
	require.NoError(t, err)

	assert.JSONEq(t, `{"v":1,"kind":"direct","telephon":"+51999","messageID":42,"title":"ana","body":"hola","tag":"+51999"}`, string(raw))
}

func TestBuildDirectPushPayload_TitleFallsBackToTelephon(t *testing.T) {
	raw, err := BuildDirectPushPayload(schemas.Message{MessageID: 1, SenderTelephon: "+51999", Message: "x"}, "", true)
	require.NoError(t, err)
	assert.Equal(t, "+51999", decodePushPayload(t, raw)["title"])
}

func TestBuildGroupPushPayload_Contract(t *testing.T) {
	msg := schemas.GroupMessageResponse{MessageID: 9, GroupID: 7, SenderTelephon: "+51999", SenderUsername: "ana", Message: "hola"}

	raw, err := BuildGroupPushPayload(msg, "Familia", "ana", true)
	require.NoError(t, err)

	assert.JSONEq(t, `{"v":1,"kind":"group","groupID":7,"messageID":9,"title":"Familia","body":"ana: hola","tag":"group:7"}`, string(raw))
}

func TestBuildPushPayload_MediaLabels(t *testing.T) {
	cases := map[string]string{
		"image":    "📷 Foto",
		"audio":    "🎵 Audio",
		"video":    "🎥 Video",
		"document": "📄 Documento",
		"sticker":  "✨ Sticker",
	}
	for mediaType, label := range cases {
		t.Run(mediaType, func(t *testing.T) {
			raw, err := BuildDirectPushPayload(schemas.Message{MessageID: 1, SenderTelephon: "+1", Message: "pie de foto", MediaType: mediaType, MediaUrl: "/storage/x"}, "ana", true)
			require.NoError(t, err)
			assert.Equal(t, label, decodePushPayload(t, raw)["body"])

			raw, err = BuildGroupPushPayload(schemas.GroupMessageResponse{MessageID: 1, GroupID: 2, SenderTelephon: "+1", MediaType: mediaType}, "G", "ana", true)
			require.NoError(t, err)
			assert.Equal(t, "ana: "+label, decodePushPayload(t, raw)["body"])
		})
	}
}

func TestBuildPushPayload_LongBodyTruncatedTo100Runes(t *testing.T) {
	long := strings.Repeat("ñ", 150)
	raw, err := BuildDirectPushPayload(schemas.Message{MessageID: 1, SenderTelephon: "+1", Message: long}, "ana", true)
	require.NoError(t, err)

	body := decodePushPayload(t, raw)["body"].(string)
	assert.Equal(t, 101, utf8.RuneCountInString(body), "100 caracteres + elipsis")
	assert.True(t, strings.HasSuffix(body, "…"))
	assert.Equal(t, strings.Repeat("ñ", 100)+"…", body)
}

func TestBuildPushPayload_ExactlyMaxIsNotTruncated(t *testing.T) {
	exact := strings.Repeat("a", 100)
	raw, err := BuildDirectPushPayload(schemas.Message{MessageID: 1, SenderTelephon: "+1", Message: exact}, "ana", true)
	require.NoError(t, err)
	assert.Equal(t, exact, decodePushPayload(t, raw)["body"])
}

func TestBuildPushPayload_PreviewOffUsesGenericBody(t *testing.T) {
	raw, err := BuildDirectPushPayload(schemas.Message{MessageID: 1, SenderTelephon: "+1", Message: "secreto"}, "ana", false)
	require.NoError(t, err)
	m := decodePushPayload(t, raw)
	assert.Equal(t, "Nuevo mensaje", m["body"])
	assert.Equal(t, "ana", m["title"], "el título se conserva")
	assert.NotContains(t, string(raw), "secreto")

	raw, err = BuildGroupPushPayload(schemas.GroupMessageResponse{MessageID: 1, GroupID: 2, SenderTelephon: "+1", Message: "secreto", MediaType: "image"}, "Familia", "ana", false)
	require.NoError(t, err)
	m = decodePushPayload(t, raw)
	assert.Equal(t, "Nuevo mensaje", m["body"])
	assert.Equal(t, "Familia", m["title"])
	assert.NotContains(t, string(raw), "secreto")
}

func TestBuildPushPayload_EmptyTextFallsBackToGeneric(t *testing.T) {
	raw, err := BuildDirectPushPayload(schemas.Message{MessageID: 1, SenderTelephon: "+1", Message: "   "}, "ana", true)
	require.NoError(t, err)
	assert.Equal(t, "Nuevo mensaje", decodePushPayload(t, raw)["body"])
}

// El payload cifrado debe caber holgadamente en el límite de los servicios de
// push (~4 KB): se exige < 3 KB incluso en el peor caso de escapado JSON.
func TestBuildPushPayload_StaysUnder3KB(t *testing.T) {
	worst := strings.Repeat("< ", 300)
	longName := strings.Repeat("<", 500)
	raw, err := BuildGroupPushPayload(schemas.GroupMessageResponse{MessageID: 4294967295, GroupID: 4294967295, SenderTelephon: strings.Repeat("9", 20), Message: worst}, longName, longName, true)
	require.NoError(t, err)
	assert.Less(t, len(raw), 3*1024)

	raw, err = BuildDirectPushPayload(schemas.Message{MessageID: 4294967295, SenderTelephon: strings.Repeat("9", 20), Message: worst}, longName, true)
	require.NoError(t, err)
	assert.Less(t, len(raw), 3*1024)
}
