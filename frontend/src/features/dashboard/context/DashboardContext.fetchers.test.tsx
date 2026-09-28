// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DashboardProvider, useDashboard, type DashboardContextValue } from './DashboardContext';

// R3-dashboard-fetcher-wiring-untested: `fetchProfile` (avatar_url/wallpaper_url
// guards, DashboardContext.tsx:271-272) and `fetchUserGroups`/`fetchGroupMessages`/
// `fetchGroupDetail` (via the M4b normalizers in `lib/normalizeResponses.ts`) were
// only unit-tested at the normalizer level — the wiring that actually calls them
// from a mounted DashboardProvider, with a null response body, had no test. This
// mounts the real provider with axios/groupApi/useWebSocket/useAuth mocked to
// return null bodies and asserts the fetchers don't throw and state degrades to
// empty defaults instead.

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

// IMPORTANT: these mock return values must keep a STABLE object/function
// identity across renders (defined once, outside the factory closures) —
// a fresh object literal per `useAuth()`/`useWebSocket()` call changes the
// `user`/`on`/`off`/... identity every render, which re-triggers the mount
// effect's `[user, ...]` dependency on every render (each iteration resolves
// a promise and calls a setter, causing another render) and hangs the test.
const stableUser = { username: 'ana', telephon: '111', avatar: '' };
const stableLogout = vi.fn();
const stableWs = {
    isConnected: false,
    connectionState: 'disconnected' as const,
    on: vi.fn(),
    off: vi.fn(),
    sendMessage: vi.fn(),
    sendReadConfirmation: vi.fn(),
    sendTypingIndicator: vi.fn(),
    sendGroupMessage: vi.fn(),
    sendGroupTyping: vi.fn(),
    sendGroupEditMessage: vi.fn(),
    sendGroupDeleteMessage: vi.fn(),
    sendGroupJoin: vi.fn(),
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

describe('DashboardProvider fetchers with a null response body', () => {
    let container: HTMLDivElement;
    let root: Root;
    // Every fetcher wraps its body in try/catch and only `console.error`s on
    // an actual exception (see e.g. `catch (err) { console.error('Error
    // fetching groups:', err); }`) — spying on it is what actually catches a
    // guard regression: `groups`/`groupMessages` already default to `[]`, so
    // asserting their value alone would still pass even if the normalizer
    // threw and the catch block silently swallowed it (stale/default state
    // looks the same either way). Asserting no console.error is what proves
    // "did not throw", not just "state looks empty".
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.clearAllMocks();
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        mockGet.mockResolvedValue({ data: null });
        mockGetUserGroups.mockResolvedValue({ data: null });
        mockGetGroupMessages.mockResolvedValue({ data: null });
        mockGetGroupDetail.mockResolvedValue({ data: null });
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => { root.unmount(); });
        container.remove();
        consoleErrorSpy.mockRestore();
    });

    it('mounts, runs the initial fetch effect and degrades to empty defaults without throwing', async () => {
        let ctx: DashboardContextValue | undefined;
        await act(async () => {
            root.render(<DashboardProvider><Harness onReady={(v) => { ctx = v; }} /></DashboardProvider>);
        });

        // fetchProfile: null body -> profile null, myAvatar/globalWallpaper stay default.
        expect(ctx?.profile).toBeNull();
        expect(ctx?.myAvatar).toBe('');
        expect(ctx?.globalWallpaper).toBe('');
        // fetchContacts / fetchAllChats: null body -> empty collections.
        expect(ctx?.contacts).toEqual([]);
        // fetchUserGroups (mount effect): null body -> [] via normalizeGroupsResponse.
        expect(ctx?.groups).toEqual([]);
        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('fetchGroupMessages(groupID) with a null body does not throw and sets an empty message list', async () => {
        let ctx: DashboardContextValue | undefined;
        await act(async () => {
            root.render(<DashboardProvider><Harness onReady={(v) => { ctx = v; }} /></DashboardProvider>);
        });

        await act(async () => {
            await expect(ctx!.fetchGroupMessages(42)).resolves.toBeUndefined();
        });

        expect(ctx?.groupMessages[42]).toEqual([]);
        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('fetchGroupDetail(groupID) with a null body does not throw and leaves selectedGroup untouched', async () => {
        let ctx: DashboardContextValue | undefined;
        await act(async () => {
            root.render(<DashboardProvider><Harness onReady={(v) => { ctx = v; }} /></DashboardProvider>);
        });

        await act(async () => {
            await expect(ctx!.fetchGroupDetail(42)).resolves.toBeUndefined();
        });

        expect(ctx?.selectedGroup).toBeNull();
        expect(ctx?.groupMessages[42]).toBeUndefined();
        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('fetchUserGroups degrades an already-populated groups list back to [] on a later null body (not left stale)', async () => {
        mockGetUserGroups.mockResolvedValueOnce({
            data: {
                groups: [{
                    ID: 1, Name: 'g1', CreatorTelephon: '111', MemberCount: 1,
                    UserRole: 'admin', CreatedAt: '2024-01-01T00:00:00Z',
                }],
            },
        });
        let ctx: DashboardContextValue | undefined;
        await act(async () => {
            root.render(<DashboardProvider><Harness onReady={(v) => { ctx = v; }} /></DashboardProvider>);
        });
        expect(ctx?.groups).toHaveLength(1);

        mockGetUserGroups.mockResolvedValue({ data: null });
        await act(async () => {
            await expect(ctx!.fetchUserGroups()).resolves.toBeUndefined();
        });

        expect(ctx?.groups).toEqual([]);
        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
});
