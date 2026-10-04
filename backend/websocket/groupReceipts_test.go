package websocket

import (
	"context"
	"encoding/json"
	"errors"
	"gorm/backend/schemas"
	"gorm/backend/services"
	"testing"
	"time"
)

// fakeReceiptGroupService implementa solo lo que usan los handlers de acuses;
// el resto de GroupServicer queda nil (panic si se usara por error).
type fakeReceiptGroupService struct {
	services.GroupServicer
	deliveredCalls []uint
	readCalls      []uint
	update         *schemas.GroupReceiptUpdate
	err            error
	groups         []schemas.GroupResponse
}

func (f *fakeReceiptGroupService) AdvanceGroupDelivered(tel string, groupID, upTo uint, _ context.Context) (*schemas.GroupReceiptUpdate, error) {
	f.deliveredCalls = append(f.deliveredCalls, upTo)
	if f.update != nil {
		u := *f.update
		u.GroupID, u.Telephon = groupID, tel
		return &u, f.err
	}
	return nil, f.err
}

func (f *fakeReceiptGroupService) AdvanceGroupRead(tel string, groupID, upTo uint, _ context.Context) (*schemas.GroupReceiptUpdate, error) {
	f.readCalls = append(f.readCalls, upTo)
	if f.update != nil {
		u := *f.update
		u.GroupID, u.Telephon = groupID, tel
		return &u, f.err
	}
	return nil, f.err
}

func (f *fakeReceiptGroupService) GetUserGroups(string, context.Context) ([]schemas.GroupResponse, error) {
	return f.groups, nil
}

type fakeChatForInit struct{ services.ChatServicer }

func (fakeChatForInit) ServiceGetSendersAndMarkDelivered(string, context.Context) ([]string, error) {
	return nil, nil
}

type receiptHarness struct {
	hub      *Hub
	acker    *Client
	peer     *Client
	svc      *fakeReceiptGroupService
	handlerF func(payload string) *MessageHandler
}

func newReceiptHarness(t *testing.T) *receiptHarness {
	t.Helper()
	h := newTestHub()
	svc := &fakeReceiptGroupService{}
	acker := NewClient("acker", "+1", nil)
	acker.ServiceGroup = svc
	peer := NewClient("peer", "+2", nil)
	h.RegisterClient(acker)
	h.RegisterClient(peer)
	h.JoinRoom(7, acker)
	h.JoinRoom(7, peer)
	return &receiptHarness{
		hub: h, acker: acker, peer: peer, svc: svc,
		handlerF: func(payload string) *MessageHandler {
			return NewMessageHandler(acker, h, json.RawMessage(payload))
		},
	}
}

func drain(c *Client) [][]byte {
	var out [][]byte
	for {
		select {
		case m := <-c.Send:
			out = append(out, m)
		case <-time.After(20 * time.Millisecond):
			return out
		}
	}
}

func receiptsIn(t *testing.T, msgs [][]byte) []schemas.GroupReceiptUpdate {
	t.Helper()
	var out []schemas.GroupReceiptUpdate
	for _, m := range msgs {
		var env struct {
			Type    string                     `json:"type"`
			Payload schemas.GroupReceiptUpdate `json:"payload"`
		}
		if err := json.Unmarshal(m, &env); err != nil {
			t.Fatalf("mensaje WS inválido: %v", err)
		}
		if env.Type == "group_receipt" {
			out = append(out, env.Payload)
		}
	}
	return out
}

func TestHandleGroupRead_PushesReceiptToPeersOnly(t *testing.T) {
	rh := newReceiptHarness(t)
	rh.svc.update = &schemas.GroupReceiptUpdate{DeliveredUpTo: 12, ReadUpTo: 12}
	rh.handlerF(`{"groupID":7,"upToMessageID":12}`).HandleGroupRead()

	if len(rh.svc.readCalls) != 1 || rh.svc.readCalls[0] != 12 {
		t.Fatalf("read debía llamarse una vez con 12, got %v", rh.svc.readCalls)
	}
	got := receiptsIn(t, drain(rh.peer))
	if len(got) != 1 || got[0].GroupID != 7 || got[0].Telephon != "+1" || got[0].ReadUpTo != 12 || got[0].DeliveredUpTo != 12 {
		t.Fatalf("receipt inesperado: %+v", got)
	}
	if own := receiptsIn(t, drain(rh.acker)); len(own) != 0 {
		t.Fatalf("quien envía el ack no debe recibir el push: %+v", own)
	}
}

func TestHandleGroupDelivered_PushesReceipt(t *testing.T) {
	rh := newReceiptHarness(t)
	rh.svc.update = &schemas.GroupReceiptUpdate{DeliveredUpTo: 9}
	rh.handlerF(`{"groupID":7,"messageID":9}`).HandleGroupDelivered()

	if len(rh.svc.deliveredCalls) != 1 || rh.svc.deliveredCalls[0] != 9 {
		t.Fatalf("delivered debía llamarse con 9, got %v", rh.svc.deliveredCalls)
	}
	got := receiptsIn(t, drain(rh.peer))
	if len(got) != 1 || got[0].DeliveredUpTo != 9 || got[0].ReadUpTo != 0 {
		t.Fatalf("receipt inesperado: %+v", got)
	}
}

func TestGroupReceiptHandlers_NoPushWhenNothingAdvancedOrError(t *testing.T) {
	cases := []struct {
		name string
		svc  func(*fakeReceiptGroupService)
		run  func(*MessageHandler)
		body string
	}{
		{"read sin cambio", func(f *fakeReceiptGroupService) {}, (*MessageHandler).HandleGroupRead, `{"groupID":7,"upToMessageID":3}`},
		{"delivered sin cambio", func(f *fakeReceiptGroupService) {}, (*MessageHandler).HandleGroupDelivered, `{"groupID":7,"messageID":3}`},
		{"read con error (no miembro)", func(f *fakeReceiptGroupService) {
			f.update = &schemas.GroupReceiptUpdate{ReadUpTo: 3}
			f.err = errors.New("no eres miembro de este grupo")
		}, (*MessageHandler).HandleGroupRead, `{"groupID":7,"upToMessageID":3}`},
		{"delivered con error", func(f *fakeReceiptGroupService) {
			f.update = &schemas.GroupReceiptUpdate{DeliveredUpTo: 3}
			f.err = errors.New("boom")
		}, (*MessageHandler).HandleGroupDelivered, `{"groupID":7,"messageID":3}`},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			rh := newReceiptHarness(t)
			c.svc(rh.svc)
			c.run(rh.handlerF(c.body))
			if got := receiptsIn(t, drain(rh.peer)); len(got) != 0 {
				t.Fatalf("no debía haber push: %+v", got)
			}
		})
	}
}

func TestGroupReceiptHandlers_IgnoreMalformedPayloads(t *testing.T) {
	rh := newReceiptHarness(t)
	rh.svc.update = &schemas.GroupReceiptUpdate{ReadUpTo: 1}
	for _, body := range []string{`not json`, `{}`, `{"groupID":0,"upToMessageID":5}`, `{"groupID":7}`, `{"groupID":7,"upToMessageID":0}`} {
		rh.handlerF(body).HandleGroupRead()
		rh.handlerF(body).HandleGroupDelivered()
	}
	if len(rh.svc.readCalls)+len(rh.svc.deliveredCalls) != 0 {
		t.Fatalf("payloads inválidos no deben llegar al servicio: %v %v", rh.svc.readCalls, rh.svc.deliveredCalls)
	}
}

func TestInitClient_AdvancesDeliveredForEachGroup(t *testing.T) {
	rh := newReceiptHarness(t)
	rh.svc.groups = []schemas.GroupResponse{{ID: 7}, {ID: 8}}
	rh.svc.update = &schemas.GroupReceiptUpdate{DeliveredUpTo: 20}

	rh.hub.JoinRoom(8, rh.peer)
	initClient(rh.hub, rh.acker, fakeChatForInit{}, rh.svc)

	if len(rh.svc.deliveredCalls) != 2 {
		t.Fatalf("delivered debía avanzar en cada grupo, got %v", rh.svc.deliveredCalls)
	}
	for _, upTo := range rh.svc.deliveredCalls {
		if upTo != allGroupMessages {
			t.Fatalf("debía pedir hasta el último mensaje (%d), got %d", allGroupMessages, upTo)
		}
	}
	got := receiptsIn(t, drain(rh.peer))
	if len(got) != 2 || got[0].Telephon != "+1" {
		t.Fatalf("el peer debía recibir un receipt por grupo: %+v", got)
	}
}

func TestRouterRegistersGroupReceiptHandlers(t *testing.T) {
	router := NewClient("u", "+1", nil).buildRouter()
	for _, typ := range []string{"group_delivered", "group_read"} {
		if router[typ] == nil {
			t.Fatalf("falta el handler %q en el router", typ)
		}
	}
}
