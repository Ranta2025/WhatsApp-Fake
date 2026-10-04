package services

import (
	"context"
	"errors"
	"sort"
	"sync"
	"testing"
	"time"

	"gorm/backend/models"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakePushPolicy simula chat_mutes + contact_data_bases aplicando el mismo
// filtro de vigencia que el repositorio con el now que recibe.
type fakePushPolicy struct {
	mu          sync.Mutex
	mutes       map[string]*time.Time // "direct:<receptor>:<remitente>" | "group:<id>:<tel>"; nil = siempre
	contacts    map[string]string     // "<receptor>><remitente>" -> status
	err         error
	directCalls int
	groupAsked  [][]string
	nowSeen     []time.Time
}

func newFakePushPolicy() *fakePushPolicy {
	return &fakePushPolicy{mutes: map[string]*time.Time{}, contacts: map[string]string{}}
}

func (f *fakePushPolicy) active(key string, now time.Time) bool {
	until, ok := f.mutes[key]
	return ok && (until == nil || until.After(now))
}

func (f *fakePushPolicy) DirectPushState(receiver, sender string, now time.Time, _ context.Context) (models.DirectPushState, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.directCalls++
	f.nowSeen = append(f.nowSeen, now)
	if f.err != nil {
		return models.DirectPushState{}, f.err
	}
	return models.DirectPushState{
		Muted:         f.active("direct:"+receiver+":"+sender, now),
		ContactStatus: f.contacts[receiver+">"+sender],
	}, nil
}

func (f *fakePushPolicy) MutedTelephonsInGroup(groupID uint, telephons []string, now time.Time, _ context.Context) ([]string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	sorted := append([]string(nil), telephons...)
	sort.Strings(sorted)
	f.groupAsked = append(f.groupAsked, sorted)
	f.nowSeen = append(f.nowSeen, now)
	if f.err != nil {
		return nil, f.err
	}
	var out []string
	for _, tel := range telephons {
		if f.active("group:7:"+tel, now) && groupID == 7 {
			out = append(out, tel)
		}
	}
	return out, nil
}

var pushMuteClock = time.Date(2026, 10, 4, 12, 0, 0, 0, time.UTC)

// newPolicyHarness es newPushHarness con la política de destinatarios
// (silencios + contactos) y un reloj fijo. +2 tiene a +1 como contacto aceptado.
func newPolicyHarness(t *testing.T, targets ...models.PushTarget) (*pushHarness, *fakePushPolicy) {
	t.Helper()
	h := newPushHarness(t, dispatchPushCfg, targets...)
	h.d.Close() // se reemplaza por uno con política
	policy := newFakePushPolicy()
	policy.contacts["+2>+1"] = models.ContactStatusAccepted
	h.d = NewPushDispatcher(dispatchPushCfg, PushDispatcherDeps{Repo: h.repo, Users: h.dir, Groups: h.dir, Sender: h.sender, Policy: policy})
	h.d.now = func() time.Time { return pushMuteClock }
	t.Cleanup(h.d.Close)
	return h, policy
}

func TestPushNotifier_DirectAcceptedContactNormalPayload(t *testing.T) {
	h, policy := newPolicyHarness(t, pushTarget(10, "+2", false))

	h.d.NotifyDirect("+2", "+1", directMsg("hola"))
	h.d.Close()

	require.Len(t, h.sender.sent, 1)
	assert.Equal(t, "ana", h.sender.sent[0].payload["title"])
	assert.Equal(t, "hola", h.sender.sent[0].payload["body"])
	assert.Equal(t, 1, policy.directCalls, "una sola consulta de política por mensaje")
	assert.Equal(t, []time.Time{pushMuteClock}, policy.nowSeen, "usa el reloj del despacho")
}

func TestPushNotifier_DirectMutedSkips(t *testing.T) {
	for name, until := range map[string]*time.Time{
		"para siempre": nil,
		"8h vigente":   ptrTime(pushMuteClock.Add(8 * time.Hour)),
	} {
		t.Run(name, func(t *testing.T) {
			h, policy := newPolicyHarness(t, pushTarget(10, "+2", false))
			policy.mutes["direct:+2:+1"] = until

			h.d.NotifyDirect("+2", "+1", directMsg("hola"))
			h.d.Close()

			assert.Empty(t, h.sender.sent)
			assert.Empty(t, h.repo.asked, "ni siquiera lista suscripciones")
		})
	}
}

func TestPushNotifier_DirectExpiredMuteStillNotifies(t *testing.T) {
	h, policy := newPolicyHarness(t, pushTarget(10, "+2", false))
	policy.mutes["direct:+2:+1"] = ptrTime(pushMuteClock.Add(-time.Minute))

	h.d.NotifyDirect("+2", "+1", directMsg("hola"))
	h.d.Close()

	assert.Equal(t, []uint{10}, h.sender.sentIDs())
}

// Silenciar el 1:1 con +3 no afecta a los mensajes de +1.
func TestPushNotifier_DirectMuteIsPerChat(t *testing.T) {
	h, policy := newPolicyHarness(t, pushTarget(10, "+2", false))
	policy.mutes["direct:+2:+3"] = nil

	h.d.NotifyDirect("+2", "+1", directMsg("hola"))
	h.d.Close()

	assert.Equal(t, []uint{10}, h.sender.sentIDs())
}

// El receptor tiene al remitente en "rejected" (bloqueado): nunca hay push.
func TestPushNotifier_DirectBlockedSenderSkips(t *testing.T) {
	h, policy := newPolicyHarness(t, pushTarget(10, "+2", false))
	policy.contacts["+2>+1"] = models.ContactStatusRejected

	h.d.NotifyDirect("+2", "+1", directMsg("hola"))
	h.d.Close()

	assert.Empty(t, h.sender.sent)
	assert.Empty(t, h.repo.asked)
}

// Remitente que no es contacto aceptado del receptor (anti spam/phishing):
// se notifica, pero con el cuerpo genérico y el teléfono como título (nunca
// el username elegido por el remitente), aunque la preview esté activada.
func TestPushNotifier_DirectNonContactGenericBody(t *testing.T) {
	for name, status := range map[string]string{"sin fila": "", "pendiente": models.ContactStatusPending} {
		t.Run(name, func(t *testing.T) {
			h, policy := newPolicyHarness(t, pushTarget(10, "+2", false))
			if status == "" {
				delete(policy.contacts, "+2>+1")
			} else {
				policy.contacts["+2>+1"] = status
			}

			h.d.NotifyDirect("+2", "+1", directMsg("haz clic en este enlace"))
			h.d.Close()

			require.Len(t, h.sender.sent, 1)
			p := h.sender.sent[0].payload
			assert.Equal(t, "Nuevo mensaje", p["body"])
			assert.Equal(t, "+1", p["title"])
			assert.Equal(t, "+1", p["telephon"], "el clic sigue abriendo el chat")
		})
	}
}

// Ante un error de la política no se notifica (mejor perder un push que
// avisar de un chat silenciado o de un remitente bloqueado).
func TestPushNotifier_PolicyErrorSkips(t *testing.T) {
	h, policy := newPolicyHarness(t, pushTarget(10, "+2", false), pushTarget(11, "+3", false))
	policy.err = errors.New("db caída")

	h.d.NotifyDirect("+2", "+1", directMsg("hola"))
	h.d.NotifyGroup(7, "+1", groupMsg("hola"), nil)
	h.d.Close()

	assert.Empty(t, h.sender.sent)
	assert.Empty(t, h.repo.asked)
}

func TestPushNotifier_GroupSkipsMutedMembersInOneQuery(t *testing.T) {
	h, policy := newPolicyHarness(t,
		pushTarget(2, "+2", false), pushTarget(3, "+3", false), pushTarget(4, "+4", false))
	policy.mutes["group:7:+3"] = nil                                      // siempre
	policy.mutes["group:7:+4"] = ptrTime(pushMuteClock.Add(-time.Second)) // vencido
	policy.mutes["direct:+2:+1"] = nil                                    // el 1:1 no afecta al grupo
	policy.contacts["+2>+1"] = models.ContactStatusRejected               // el bloqueo solo aplica a 1:1

	h.d.NotifyGroup(7, "+1", groupMsg("hola"), nil)
	h.d.Close()

	assert.Equal(t, [][]string{{"+2", "+3", "+4"}}, policy.groupAsked, "una sola consulta para todos los destinatarios")
	assert.Equal(t, 0, policy.directCalls)
	assert.Equal(t, [][]string{{"+2", "+4"}}, h.repo.asked)
	assert.Equal(t, []uint{2, 4}, h.sender.sentIDs())
}

func TestPushNotifier_GroupAllMutedSkipsSubscriptions(t *testing.T) {
	h, policy := newPolicyHarness(t, pushTarget(2, "+2", false))
	for _, tel := range []string{"+2", "+3", "+4"} {
		policy.mutes["group:7:"+tel] = nil
	}

	h.d.NotifyGroup(7, "+1", groupMsg("hola"), nil)
	h.d.Close()

	assert.Empty(t, h.repo.asked)
	assert.Empty(t, h.sender.sent)
}

// Los conectados se descartan antes de consultar la política.
func TestPushNotifier_GroupPolicyOnlyAsksOfflineRecipients(t *testing.T) {
	h, policy := newPolicyHarness(t, pushTarget(2, "+2", false))

	h.d.NotifyGroup(7, "+1", groupMsg("hola"), func(tel string) bool { return tel != "+2" })
	h.d.Close()

	assert.Equal(t, [][]string{{"+2"}}, policy.groupAsked)
	assert.Equal(t, []uint{2}, h.sender.sentIDs())
}
