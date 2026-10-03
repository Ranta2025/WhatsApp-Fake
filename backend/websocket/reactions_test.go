package websocket

import (
	"context"
	"encoding/json"
	"gorm/backend/models"
	"gorm/backend/schemas"
	"gorm/backend/services"
	"testing"
)

// fakeReactionService implementa services.ReactionServicer devolviendo el cambio
// configurado y registrando las llamadas.
type fakeReactionService struct {
	change *services.ReactionChange
	err    error
	calls  []fakeReactCall
}

type fakeReactCall struct {
	telephon, kind string
	messageID      uint
	groupID        uint
	emoji          string
}

func (f *fakeReactionService) React(telephon, kind string, messageID, groupID uint, emoji string, _ context.Context) (*services.ReactionChange, error) {
	f.calls = append(f.calls, fakeReactCall{telephon, kind, messageID, groupID, emoji})
	if f.err != nil {
		return nil, f.err
	}
	return f.change, nil
}

func (f *fakeReactionService) ListReactionsFor(string, string, uint, uint, context.Context) ([]models.ReactionUsers, error) {
	return nil, nil
}

type reactionHarness struct {
	hub                   *Hub
	actor, other, bystand *Client
	svc                   *fakeReactionService
}

// +1 reacciona; +2 es el otro participante del 1:1 y miembro del grupo 7; +3 es
// miembro del grupo 7 pero ajeno al 1:1; +4 está conectado pero no está en nada.
func newReactionHarness(t *testing.T) (*reactionHarness, *Client) {
	t.Helper()
	h := newTestHub()
	svc := &fakeReactionService{}
	h.SetReactionService(svc)
	actor := NewClient("ana", "+1", nil)
	other := NewClient("luis", "+2", nil)
	bystand := NewClient("marta", "+3", nil)
	outsider := NewClient("zoe", "+4", nil)
	for _, c := range []*Client{actor, other, bystand, outsider} {
		h.RegisterClient(c)
	}
	for _, c := range []*Client{actor, other, bystand} {
		h.JoinRoom(7, c)
	}
	return &reactionHarness{hub: h, actor: actor, other: other, bystand: bystand, svc: svc}, outsider
}

func (rh *reactionHarness) send(payload string) {
	NewMessageHandler(rh.actor, rh.hub, json.RawMessage(payload)).HandleReaction()
}

type reactionEnvelope struct {
	Type    string                 `json:"type"`
	Payload schemas.ReactionEvent  `json:"payload"`
	Error   string                 `json:"error"`
	Context map[string]interface{} `json:"context"`
}

func reactionsIn(t *testing.T, msgs [][]byte) []reactionEnvelope {
	t.Helper()
	var out []reactionEnvelope
	for _, m := range msgs {
		var env reactionEnvelope
		if err := json.Unmarshal(m, &env); err != nil {
			t.Fatalf("mensaje WS inválido: %v", err)
		}
		if env.Type == "reaction" {
			out = append(out, env)
		}
	}
	return out
}

func errorsIn(t *testing.T, msgs [][]byte) []reactionEnvelope {
	t.Helper()
	var out []reactionEnvelope
	for _, m := range msgs {
		var env reactionEnvelope
		if err := json.Unmarshal(m, &env); err != nil {
			t.Fatalf("mensaje WS inválido: %v", err)
		}
		if env.Type == "error" {
			out = append(out, env)
		}
	}
	return out
}

func directChange(changed bool, emoji string) *services.ReactionChange {
	return &services.ReactionChange{
		Kind: models.ReactionKindDirect, MessageID: 10, Emoji: emoji, Changed: changed, Removed: emoji == "",
		ActorTelephon: "+1", ActorUsername: "ana", AuthorTelephon: "+2", OtherTelephon: "+2", Preview: "hola",
	}
}

func groupChange(changed bool, emoji string) *services.ReactionChange {
	return &services.ReactionChange{
		Kind: models.ReactionKindGroup, MessageID: 20, GroupID: 7, Emoji: emoji, Changed: changed, Removed: emoji == "",
		ActorTelephon: "+1", ActorUsername: "ana", AuthorTelephon: "+3", Preview: "📷 Photo",
	}
}

func TestHandleReaction_Direct_FansOutToActorAndOtherOnly(t *testing.T) {
	rh, outsider := newReactionHarness(t)
	rh.svc.change = directChange(true, "👍")

	rh.send(`{"kind":"direct","messageID":10,"emoji":"👍"}`)

	if len(rh.svc.calls) != 1 || rh.svc.calls[0] != (fakeReactCall{"+1", "direct", 10, 0, "👍"}) {
		t.Fatalf("llamada inesperada al servicio: %+v", rh.svc.calls)
	}
	for name, c := range map[string]*Client{"actor": rh.actor, "other": rh.other} {
		got := reactionsIn(t, drain(c))
		if len(got) != 1 {
			t.Fatalf("%s debía recibir 1 evento, got %d", name, len(got))
		}
		ev := got[0].Payload
		if ev.Kind != "direct" || ev.MessageID != 10 || ev.Telephon != "+1" || ev.Username != "ana" ||
			ev.Emoji != "👍" || ev.AuthorTelephon != "+2" || ev.Preview != "hola" || ev.GroupID != 0 {
			t.Fatalf("%s recibió payload inesperado: %+v", name, ev)
		}
	}
	for name, c := range map[string]*Client{"bystander": rh.bystand, "outsider": outsider} {
		if got := reactionsIn(t, drain(c)); len(got) != 0 {
			t.Fatalf("%s no debía recibir el evento 1:1: %+v", name, got)
		}
	}
}

func TestHandleReaction_Group_FansOutToActorAndMembers(t *testing.T) {
	rh, outsider := newReactionHarness(t)
	rh.svc.change = groupChange(true, "🙏")

	rh.send(`{"kind":"group","messageID":20,"groupID":7,"emoji":"🙏"}`)

	if len(rh.svc.calls) != 1 || rh.svc.calls[0] != (fakeReactCall{"+1", "group", 20, 7, "🙏"}) {
		t.Fatalf("llamada inesperada al servicio: %+v", rh.svc.calls)
	}
	for name, c := range map[string]*Client{"actor": rh.actor, "member 2": rh.other, "member 3": rh.bystand} {
		got := reactionsIn(t, drain(c))
		if len(got) != 1 {
			t.Fatalf("%s debía recibir exactamente 1 evento, got %d", name, len(got))
		}
		if ev := got[0].Payload; ev.GroupID != 7 || ev.Kind != "group" || ev.AuthorTelephon != "+3" || ev.Preview != "📷 Photo" {
			t.Fatalf("%s payload inesperado: %+v", name, ev)
		}
	}
	if got := reactionsIn(t, drain(outsider)); len(got) != 0 {
		t.Fatalf("un conectado fuera del grupo no debe recibirlo: %+v", got)
	}
}

func TestHandleReaction_Removal_SendsEmptyEmoji(t *testing.T) {
	rh, _ := newReactionHarness(t)
	rh.svc.change = directChange(true, "")

	rh.send(`{"kind":"direct","messageID":10,"emoji":""}`)

	got := reactionsIn(t, drain(rh.other))
	if len(got) != 1 || got[0].Payload.Emoji != "" {
		t.Fatalf("quitar debía difundir emoji vacío: %+v", got)
	}
	var raw map[string]map[string]interface{}
	for _, m := range [][]byte{mustMarshalEvent(t, directChange(true, ""))} {
		_ = json.Unmarshal(m, &raw)
	}
	if v, ok := raw["payload"]["emoji"]; !ok || v != "" {
		t.Fatalf("el campo emoji debe viajar siempre, aun vacío: %+v", raw)
	}
}

func mustMarshalEvent(t *testing.T, ch *services.ReactionChange) []byte {
	t.Helper()
	b, err := reactionEventBytes(ch)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func TestHandleReaction_NoOpDoesNotFanOut(t *testing.T) {
	rh, _ := newReactionHarness(t)
	rh.svc.change = directChange(false, "")

	rh.send(`{"kind":"direct","messageID":10,"emoji":""}`)

	for name, c := range map[string]*Client{"actor": rh.actor, "other": rh.other} {
		if msgs := drain(c); len(msgs) != 0 {
			t.Fatalf("un no-op no debe enviar nada a %s: %s", name, msgs)
		}
	}
}

func TestHandleReaction_ErrorRepliesToActorOnlyWithContext(t *testing.T) {
	rh, _ := newReactionHarness(t)
	rh.svc.err = services.ErrInvalidReactionEmoji

	rh.send(`{"kind":"group","messageID":20,"groupID":7,"emoji":"ok"}`)

	errs := errorsIn(t, drain(rh.actor))
	if len(errs) != 1 {
		t.Fatalf("el actor debía recibir 1 error, got %d", len(errs))
	}
	e := errs[0]
	if e.Error == "" || e.Context["action"] != "react" || e.Context["kind"] != "group" ||
		e.Context["messageID"] != float64(20) || e.Context["groupID"] != float64(7) || e.Context["status"] != float64(400) {
		t.Fatalf("error sin contexto suficiente: %+v", e)
	}
	if msgs := drain(rh.other); len(msgs) != 0 {
		t.Fatalf("el error no debe llegar a otros: %s", msgs)
	}
}

func TestHandleReaction_ErrorStatusMapping(t *testing.T) {
	cases := map[string]struct {
		err    error
		status float64
	}{
		"invalid kind": {services.ErrInvalidReactionKind, 400},
		"rate limit":   {services.ErrReactionRateLimited, 429},
		"not member":   {services.ErrNotGroupMember, 403},
		"no message":   {models.ErrMessageNotFound, 404},
		"no group msg": {services.ErrGroupMessageNotFound, 404},
		"internal":     {context.DeadlineExceeded, 500},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			rh, _ := newReactionHarness(t)
			rh.svc.err = c.err
			rh.send(`{"kind":"direct","messageID":10,"emoji":"👍"}`)
			errs := errorsIn(t, drain(rh.actor))
			if len(errs) != 1 || errs[0].Context["status"] != c.status {
				t.Fatalf("status esperado %v, got %+v", c.status, errs)
			}
		})
	}
}

func TestHandleReaction_MalformedPayloadRepliesErrorWithoutCallingService(t *testing.T) {
	for _, body := range []string{`not json`, `{}`, `{"kind":"direct","messageID":0,"emoji":"👍"}`} {
		rh, _ := newReactionHarness(t)
		rh.svc.change = directChange(true, "👍")
		rh.send(body)
		if len(rh.svc.calls) != 0 {
			t.Fatalf("%q no debe llegar al servicio", body)
		}
		errs := errorsIn(t, drain(rh.actor))
		if len(errs) != 1 || errs[0].Context["action"] != "react" || errs[0].Context["status"] != float64(400) {
			t.Fatalf("%q: error esperado, got %+v", body, errs)
		}
	}
}

func TestRouterRegistersReact(t *testing.T) {
	if NewClient("u", "+1", nil).buildRouter()["react"] == nil {
		t.Fatal(`falta el handler "react" en el router`)
	}
}

func TestPublishReaction_RESTActorGetsEventViaSendTo(t *testing.T) {
	rh, _ := newReactionHarness(t)
	rh.hub.PublishReaction(directChange(true, "👍"), nil)
	if got := reactionsIn(t, drain(rh.actor)); len(got) != 1 {
		t.Fatalf("el actor (REST) debía recibir el evento por su WS: %d", len(got))
	}
	if got := reactionsIn(t, drain(rh.other)); len(got) != 1 {
		t.Fatalf("el otro participante debía recibirlo: %d", len(got))
	}
	rh.hub.PublishReaction(directChange(false, ""), nil)
	if msgs := drain(rh.other); len(msgs) != 0 {
		t.Fatalf("no-op no difunde: %s", msgs)
	}
}
