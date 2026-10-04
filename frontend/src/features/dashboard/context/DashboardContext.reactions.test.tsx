// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DashboardProvider, useDashboard, type DashboardContextValue, type SelectedGroup } from './DashboardContext';
import type { ContactChat, GroupMessageResponse, Message, ReactionSummary } from '../../../types/api';
import type { ReactionEventPayload } from '../../../types/ws';

// reactions (RE4): the `reaction` WS listener applies the pure reducer to messagesByChat,
// groupMessages and the detached windows; reactToMessage is optimistic with rollback on a WS
// `error` carrying `context.action === "react"`; the author gets a toast when somebody reacts
// to their message in a chat that is not open.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockGet = vi.fn();
vi.mock('../../../api/axios', () => ({
    default: { get: (...args: unknown[]) => mockGet(...args) },
    SESSION_EXPIRED_EVENT: 'auth:session-expired',
}));

const mockGetUserGroups = vi.fn();
const mockGetGroupMessages = vi.fn();
const mockGetGroupDetail = vi.fn();
vi.mock('../../../api/groupApi', () => ({
    getUserGroups: (...args: unknown[]) => mockGetUserGroups(...args),
    getGroupMessages: (...args: unknown[]) => mockGetGroupMessages(...args),
    getGroupDetail: (...args: unknown[]) => mockGetGroupDetail(...args),
}));

const mockSendReaction = vi.fn((..._args: unknown[]) => true);
vi.mock('../../../api/websocket', () => ({
    default: { sendReaction: (...args: unknown[]) => mockSendReaction(...args) },
}));

const stableUser = { username: 'ana', telephon: '111', avatar: '' };
const stableLogout = vi.fn();
const stableWs = {
    isConnected: true,
    connectionState: 'connected' as const,
    on: vi.fn(), off: vi.fn(),
    sendMessage: vi.fn(), sendReadConfirmation: vi.fn(), sendTypingIndicator: vi.fn(),
    sendGroupMessage: vi.fn(), sendGroupTyping: vi.fn(), sendGroupEditMessage: vi.fn(),
    sendGroupDeleteMessage: vi.fn(), sendGroupJoin: vi.fn(),
    sendGroupDelivered: vi.fn(() => true), sendGroupRead: vi.fn(() => true),
};
vi.mock('../../../context/AuthContext', () => ({
    useAuth: () => ({ user: stableUser, logout: stableLogout }),
}));
vi.mock('../../../hooks/useWebSocket', () => ({
    useWebSocket: () => stableWs,
}));

function Harness({ onReady }: { onReady: (value: DashboardContextValue) => void }) {
    const dash = useDashboard();
    onReady(dash);
    return null;
}

const iso = (n: number) => new Date(Date.UTC(2024, 0, 1, 0, 0, n)).toISOString();
const chip = (Emoji: string, Count = 1, Mine = false): ReactionSummary => ({ Emoji, Count, Mine });
const chatMsg = (id: number, Reactions?: ReactionSummary[]): Message => ({
    MessageID: id, SenderTelephon: '111', Receptor: 'B', Message: `m${id}`, Status: 'visto', Time: iso(id), Edited: false,
    ...(Reactions ? { Reactions } : {}),
});
const groupMsg = (id: number, Reactions?: ReactionSummary[]): GroupMessageResponse => ({
    MessageID: id, GroupID: 9, SenderTelephon: '111', SenderUsername: 'ana', Message: `g${id}`, Time: iso(id), Edited: false,
    ...(Reactions ? { Reactions } : {}),
});
const contact = (n: string, name: string): ContactChat => ({ Number: n, ContactName: name, Username: n } as ContactChat);
const group = (): SelectedGroup => ({
    ID: 9, Name: 'Equipo', CreatorTelephon: '111', MemberCount: 3, UserRole: 'member', CreatedAt: iso(0),
    OnlyAdminsCanSend: false, OnlyAdminsCanEditInfo: false, OnlyAdminsCanAddMembers: false,
});
const direct = (over: Partial<ReactionEventPayload> = {}): ReactionEventPayload => ({
    kind: 'direct', messageID: 5, telephon: 'B', username: 'bea_user', emoji: '👍', previousEmoji: '',
    authorTelephon: '111', preview: 'hola', ...over,
});
const inGroup = (over: Partial<ReactionEventPayload> = {}): ReactionEventPayload => ({
    kind: 'group', messageID: 7, groupID: 9, telephon: 'C', username: 'carla_user', emoji: '❤️', previousEmoji: '',
    authorTelephon: '111', preview: 'g7', ...over,
});

describe('DashboardProvider reactions', () => {
    let container: HTMLDivElement;
    let root: Root;
    let ctx: DashboardContextValue | undefined;

    const handlerFor = <T,>(event: string): ((payload: T) => void) => {
        const call = [...stableWs.on.mock.calls].reverse().find(([name]) => name === event);
        if (!call) throw new Error(`no handler registered for ${event}`);
        return call[1] as (payload: T) => void;
    };
    const emitReaction = (payload: ReactionEventPayload) => act(() => { handlerFor<unknown>('reaction')(payload); });
    const emitError = (envelope: unknown) => act(() => { handlerFor<unknown>('error')(envelope); });
    const toastMessages = () => ctx!.toasts.map(t => t.message);

    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        mockGet.mockImplementation((url: string) => {
            if (url === '/api/v1/user') return Promise.resolve({ data: { Telephon: '111' } });
            if (url.startsWith('/api/v1/chat/')) return Promise.resolve({ data: [], headers: {} });
            return Promise.resolve({ data: null });
        });
        mockGetUserGroups.mockResolvedValue({ data: null });
        mockGetGroupMessages.mockResolvedValue({ data: { messages: [], hasMore: false } });
        mockGetGroupDetail.mockResolvedValue({ data: null });
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        ctx = undefined;
    });

    afterEach(() => {
        act(() => { root.unmount(); });
        container.remove();
        vi.restoreAllMocks();
    });

    const mount = async () => {
        await act(async () => {
            root.render(<DashboardProvider><Harness onReady={(v) => { ctx = v; }} /></DashboardProvider>);
        });
    };
    const seed = async () => {
        await mount();
        await act(async () => {
            ctx!.setContacts([contact('B', 'Bea')]);
            ctx!.setMessagesByChat({ B: [chatMsg(5), chatMsg(6)] });
            ctx!.setGroupMessages({ 9: [groupMsg(7), groupMsg(8)] });
        });
    };

    describe('listener', () => {
        it('applies a 1:1 reaction to messagesByChat', async () => {
            await seed();
            emitReaction(direct());
            expect(ctx!.messagesByChat['B']?.[0]?.Reactions).toEqual([chip('👍')]);
            expect(ctx!.messagesByChat['B']?.[1]?.Reactions).toBeUndefined();
        });

        it('applies a group reaction to groupMessages', async () => {
            await seed();
            emitReaction(inGroup());
            expect(ctx!.groupMessages[9]?.[0]?.Reactions).toEqual([chip('❤️')]);
        });

        it('replace by another user decrements previousEmoji and increments the new one', async () => {
            await seed();
            emitReaction(direct());
            emitReaction(direct({ emoji: '😂', previousEmoji: '👍' }));
            expect(ctx!.messagesByChat['B']?.[0]?.Reactions).toEqual([chip('😂')]);
            emitReaction(direct({ emoji: '', previousEmoji: '😂' }));
            expect(ctx!.messagesByChat['B']?.[0]?.Reactions).toBeUndefined();
        });

        it('also updates the detached windows (1:1 and group)', async () => {
            await seed();
            mockGet.mockImplementation((url: string, config?: { params?: Record<string, number> }) => {
                if (url === '/api/v1/chat/B' && config?.params?.around) {
                    return Promise.resolve({
                        data: [chatMsg(5), chatMsg(6)],
                        headers: { 'x-has-more-older': 'false', 'x-has-more-newer': 'false' },
                    });
                }
                if (url === '/api/v1/group/9/message' && config?.params?.around) {
                    return Promise.resolve({ data: { messages: [groupMsg(7), groupMsg(8)], hasMoreOlder: false, hasMoreNewer: false } });
                }
                return Promise.resolve({ data: null });
            });
            await act(async () => { await ctx!.openMessageAt({ kind: 'chat', key: 'B' }, 5); });
            await act(async () => { await ctx!.openMessageAt({ kind: 'group', id: 9 }, 7); });
            expect(ctx!.focusedChat['B']?.messages[0]?.Reactions).toBeUndefined();

            emitReaction(direct());
            emitReaction(inGroup());

            expect(ctx!.focusedChat['B']?.messages[0]?.Reactions).toEqual([chip('👍')]);
            expect(ctx!.focusedGroup[9]?.messages[0]?.Reactions).toEqual([chip('❤️')]);
            expect(ctx!.messagesByChat['B']?.[0]?.Reactions).toEqual([chip('👍')]);
        });

        it('ignores malformed payloads and unknown messages without throwing', async () => {
            await seed();
            const before = ctx!.messagesByChat;
            emitReaction({ kind: 'direct' } as never);
            emitReaction(direct({ messageID: 999 }));
            expect(ctx!.messagesByChat).toBe(before);
        });
    });

    describe('reactToMessage (optimistic + rollback)', () => {
        it('applies the change locally and sends it over WS', async () => {
            await seed();
            act(() => { ctx!.reactToMessage({ kind: 'direct', messageID: 5 }, '👍'); });
            expect(mockSendReaction).toHaveBeenCalledWith('direct', 5, '👍', undefined);
            expect(ctx!.messagesByChat['B']?.[0]?.Reactions).toEqual([chip('👍', 1, true)]);
        });

        it('tapping my current emoji removes it (sends the empty emoji)', async () => {
            await seed();
            act(() => { ctx!.reactToMessage({ kind: 'direct', messageID: 5 }, '👍'); });
            act(() => { ctx!.reactToMessage({ kind: 'direct', messageID: 5 }, '👍'); });
            expect(mockSendReaction).toHaveBeenLastCalledWith('direct', 5, '', undefined);
            expect(ctx!.messagesByChat['B']?.[0]?.Reactions).toBeUndefined();
        });

        it('group reactions carry the groupID', async () => {
            await seed();
            act(() => { ctx!.reactToMessage({ kind: 'group', messageID: 7, groupID: 9 }, '🙏'); });
            expect(mockSendReaction).toHaveBeenCalledWith('group', 7, '🙏', 9);
            expect(ctx!.groupMessages[9]?.[0]?.Reactions).toEqual([chip('🙏', 1, true)]);
        });

        it('the server echo of my own reaction does not double count', async () => {
            await seed();
            act(() => { ctx!.reactToMessage({ kind: 'direct', messageID: 5 }, '👍'); });
            emitReaction(direct({ telephon: '111', username: 'ana', authorTelephon: 'B' }));
            expect(ctx!.messagesByChat['B']?.[0]?.Reactions).toEqual([chip('👍', 1, true)]);
        });

        it('rolls back to the pre-send reactions on a WS error with react context', async () => {
            await seed();
            await act(async () => { ctx!.setMessagesByChat({ B: [chatMsg(5, [chip('❤️', 2, true)])] }); });
            act(() => { ctx!.reactToMessage({ kind: 'direct', messageID: 5 }, '👍'); });
            expect(ctx!.messagesByChat['B']?.[0]?.Reactions).toEqual([chip('❤️', 1), chip('👍', 1, true)]);

            emitError({ type: 'error', error: 'sin permiso', context: { action: 'react', kind: 'direct', messageID: 5, status: 403 } });

            expect(ctx!.messagesByChat['B']?.[0]?.Reactions).toEqual([chip('❤️', 2, true)]);
            expect(ctx!.toasts.at(-1)?.type).toBe('error');
        });

        it('rolls back a group reaction and removes the field when there were none', async () => {
            await seed();
            act(() => { ctx!.reactToMessage({ kind: 'group', messageID: 7, groupID: 9 }, '🙏'); });
            emitError({ type: 'error', error: 'x', context: { action: 'react', kind: 'group', messageID: 7, groupID: 9, status: 404 } });
            expect(ctx!.groupMessages[9]?.[0]).not.toHaveProperty('Reactions');
        });

        it('a rapid second tap rolls back to the state before the FIRST pending reaction', async () => {
            await seed();
            act(() => { ctx!.reactToMessage({ kind: 'direct', messageID: 5 }, '👍'); });
            act(() => { ctx!.reactToMessage({ kind: 'direct', messageID: 5 }, '😂'); });
            emitError({ type: 'error', error: 'x', context: { action: 'react', kind: 'direct', messageID: 5, status: 429 } });
            expect(ctx!.messagesByChat['B']?.[0]).not.toHaveProperty('Reactions');
        });

        it('ignores errors without react context and errors after the echo confirmed the change', async () => {
            await seed();
            act(() => { ctx!.reactToMessage({ kind: 'direct', messageID: 5 }, '👍'); });
            emitError({ type: 'error', error: 'otra cosa' });
            emitError({ type: 'error', error: 'x', context: { action: 'chat', kind: 'direct', messageID: 5 } });
            expect(ctx!.messagesByChat['B']?.[0]?.Reactions).toEqual([chip('👍', 1, true)]);

            emitReaction(direct({ telephon: '111', username: 'ana', authorTelephon: 'B' }));
            emitError({ type: 'error', error: 'x', context: { action: 'react', kind: 'direct', messageID: 5, status: 500 } });
            expect(ctx!.messagesByChat['B']?.[0]?.Reactions).toEqual([chip('👍', 1, true)]);
        });

        const mine = (emoji: string) => direct({ telephon: '111', username: 'ana', authorTelephon: 'B', emoji });
        const reactError = (status = 500) => emitError({ type: 'error', error: 'x', context: { action: 'react', kind: 'direct', messageID: 5, status } });
        const tap = (emoji: string) => act(() => { ctx!.reactToMessage({ kind: 'direct', messageID: 5 }, emoji); });

        it('two quick taps, echo of tap 1, error for tap 2: my chip reverts to the tap 1 emoji', async () => {
            await seed();
            tap('👍');
            tap('😂');
            emitReaction(mine('👍'));
            reactError();
            expect(ctx!.messagesByChat['B']?.[0]?.Reactions).toEqual([chip('👍', 1, true)]);
            expect(ctx!.toasts.at(-1)?.type).toBe('error');
        });

        it('error for tap 1 then echo of tap 2: final state is tap 2', async () => {
            await seed();
            tap('👍');
            tap('😂');
            reactError();
            emitReaction(mine('😂'));
            expect(ctx!.messagesByChat['B']?.[0]?.Reactions).toEqual([chip('😂', 1, true)]);
        });

        it('rollback reverses only my change and keeps concurrent changes from others', async () => {
            await seed();
            await act(async () => { ctx!.setMessagesByChat({ B: [chatMsg(5, [chip('❤️', 1)])] }); });
            tap('👍');
            emitReaction(direct({ telephon: 'C', emoji: '😂' }));
            emitReaction(direct({ telephon: 'D', emoji: '❤️', previousEmoji: '' }));
            reactError();
            const reactions = ctx!.messagesByChat['B']?.[0]?.Reactions ?? [];
            expect(reactions).toHaveLength(2);
            expect(reactions).toContainEqual(chip('❤️', 2));
            expect(reactions).toContainEqual(chip('😂', 1));
        });

        it('a no-op echo (server already held that emoji) clears the pending entry', async () => {
            await seed();
            await act(async () => { ctx!.setMessagesByChat({ B: [chatMsg(5)] }); });
            tap('👍');
            emitReaction(mine('👍'));
            tap('😂');
            emitReaction(mine('😂'));
            reactError(); // stray error: nothing is pending anymore
            expect(ctx!.messagesByChat['B']?.[0]?.Reactions).toEqual([chip('😂', 1, true)]);
        });

        it('drops pending entries older than 15s', async () => {
            vi.useFakeTimers({ toFake: ['Date'] });
            try {
                await seed();
                tap('👍');
                vi.setSystemTime(Date.now() + 16_000);
                reactError();
                expect(ctx!.messagesByChat['B']?.[0]?.Reactions).toEqual([chip('👍', 1, true)]);
            } finally {
                vi.useRealTimers();
            }
        });

        it('rolls back immediately when the socket cannot send', async () => {
            await seed();
            mockSendReaction.mockReturnValueOnce(false);
            act(() => { ctx!.reactToMessage({ kind: 'direct', messageID: 5 }, '👍'); });
            expect(ctx!.messagesByChat['B']?.[0]).not.toHaveProperty('Reactions');
            expect(ctx!.toasts.at(-1)?.type).toBe('error');
        });
    });

    describe('author notification', () => {
        it('toasts "<name> reaccionó <emoji> a: <preview>" using the contact name', async () => {
            await seed();
            emitReaction(direct());
            expect(toastMessages()).toEqual(['Bea reaccionó 👍 a: hola']);
        });

        it('falls back to the event username, then to the telephon', async () => {
            await seed();
            emitReaction(direct({ telephon: 'Z', username: 'zeta_user' }));
            emitReaction(direct({ telephon: 'Y', username: '' }));
            expect(toastMessages()).toEqual(['zeta_user reaccionó 👍 a: hola', 'Y reaccionó 👍 a: hola']);
        });

        it('group reactions use the event username when the member is unknown', async () => {
            await seed();
            emitReaction(inGroup());
            expect(toastMessages()).toEqual(['carla_user reaccionó ❤️ a: g7']);
        });

        it('does not notify when I am the reactor', async () => {
            await seed();
            emitReaction(direct({ telephon: '111', authorTelephon: '111' }));
            expect(toastMessages()).toEqual([]);
        });

        it('does not notify on removal', async () => {
            await seed();
            emitReaction(direct({ emoji: '', previousEmoji: '👍' }));
            expect(toastMessages()).toEqual([]);
        });

        it('does not notify when the viewer is not the message author', async () => {
            await seed();
            emitReaction(direct({ authorTelephon: 'B' }));
            expect(toastMessages()).toEqual([]);
        });

        it('does not notify when that 1:1 chat is open', async () => {
            await seed();
            await act(async () => { ctx!.setSelected({ ...contact('B', 'Bea'), Number: 'B' } as never); });
            emitReaction(direct());
            expect(toastMessages()).toEqual([]);
            expect(ctx!.messagesByChat['B']?.[0]?.Reactions).toEqual([chip('👍')]);
        });

        it('does not notify when that group is open, but notifies for another group', async () => {
            await seed();
            await act(async () => { ctx!.setSelectedGroup(group()); });
            emitReaction(inGroup());
            expect(toastMessages()).toEqual([]);
            emitReaction(inGroup({ groupID: 10 }));
            expect(toastMessages()).toEqual(['carla_user reaccionó ❤️ a: g7']);
        });

        it('notifies for a different open chat', async () => {
            await seed();
            await act(async () => { ctx!.setSelected({ ...contact('C', 'Carl'), Number: 'C' } as never); });
            emitReaction(direct());
            expect(toastMessages()).toEqual(['Bea reaccionó 👍 a: hola']);
        });
    });
});
