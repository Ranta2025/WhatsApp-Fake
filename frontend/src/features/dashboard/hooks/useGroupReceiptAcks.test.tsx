// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useGroupReceiptAcks, DELIVERED_DEBOUNCE_MS, READ_THROTTLE_MS } from './useGroupReceiptAcks';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

interface HarnessProps {
    isConnected?: boolean;
    openGroupId: number | null;
    messages: ReadonlyArray<{ MessageID: number | string }> | undefined;
    sendDelivered: (groupID: number, messageID: number) => boolean;
    sendRead: (groupID: number, upToMessageID: number) => boolean;
    onReady?: (api: ReturnType<typeof useGroupReceiptAcks>) => void;
}

function Harness({ isConnected = true, openGroupId, messages, sendDelivered, sendRead, onReady }: HarnessProps) {
    const api = useGroupReceiptAcks({
        selfTelephon: 'me',
        isConnected,
        openGroupId,
        openGroupMessages: messages,
        sendGroupDelivered: sendDelivered,
        sendGroupRead: sendRead,
    });
    onReady?.(api);
    return null;
}

const msgs = (...ids: Array<number | string>) => ids.map(MessageID => ({ MessageID }));

describe('useGroupReceiptAcks', () => {
    let host: HTMLDivElement;
    let root: Root;
    let sendDelivered: ReturnType<typeof vi.fn<(g: number, m: number) => boolean>>;
    let sendRead: ReturnType<typeof vi.fn<(g: number, m: number) => boolean>>;
    let visibility: DocumentVisibilityState;

    beforeEach(() => {
        vi.useFakeTimers();
        visibility = 'visible';
        vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
        sendDelivered = vi.fn(() => true);
        sendRead = vi.fn(() => true);
        host = document.createElement('div');
        document.body.appendChild(host);
        root = createRoot(host);
    });

    afterEach(() => {
        act(() => root.unmount());
        host.remove();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    const render = (props: Partial<HarnessProps> = {}) => act(async () => {
        root.render(<Harness openGroupId={null} messages={undefined} sendDelivered={sendDelivered} sendRead={sendRead} {...props} />);
    });
    const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

    describe('delivered acks', () => {
        it('coalesces incoming messages to the highest id per group in one frame', async () => {
            let api!: ReturnType<typeof useGroupReceiptAcks>;
            await render({ onReady: (a) => { api = a; } });

            act(() => {
                api.noteIncomingGroupMessage(7, 5, 'ana');
                api.noteIncomingGroupMessage(7, 9, 'luis');
                api.noteIncomingGroupMessage(7, 7, 'ana');
                api.noteIncomingGroupMessage(8, 3, 'ana');
            });
            expect(sendDelivered).not.toHaveBeenCalled();

            await advance(DELIVERED_DEBOUNCE_MS);
            expect(sendDelivered.mock.calls).toEqual([[7, 9], [8, 3]]);

            await advance(DELIVERED_DEBOUNCE_MS * 4);
            expect(sendDelivered).toHaveBeenCalledTimes(2);
        });

        it('does not ack the user\'s own messages nor invalid ids', async () => {
            let api!: ReturnType<typeof useGroupReceiptAcks>;
            await render({ onReady: (a) => { api = a; } });

            act(() => {
                api.noteIncomingGroupMessage(7, 5, 'me');
                api.noteIncomingGroupMessage(7, 0, 'ana');
                api.noteIncomingGroupMessage(0, 4, 'ana');
                api.noteIncomingGroupMessage(7, Number.NaN, 'ana');
            });
            await advance(DELIVERED_DEBOUNCE_MS * 2);
            expect(sendDelivered).not.toHaveBeenCalled();
        });
    });

    describe('read acks', () => {
        it('sends one read for the latest real message id when the group is open and visible', async () => {
            await render({ openGroupId: 7, messages: msgs(3, 5, 'system_1', 4) });
            expect(sendRead.mock.calls).toEqual([[7, 5]]);

            await render({ openGroupId: 7, messages: msgs(3, 5, 'system_1', 4) });
            await advance(READ_THROTTLE_MS * 2);
            expect(sendRead).toHaveBeenCalledTimes(1);
        });

        it('throttles bursts: the first is immediate, later ones coalesce into one trailing send with the latest id', async () => {
            await render({ openGroupId: 7, messages: msgs(5) });
            await render({ openGroupId: 7, messages: msgs(5, 6) });
            await render({ openGroupId: 7, messages: msgs(5, 6, 8) });
            expect(sendRead.mock.calls).toEqual([[7, 5]]);

            await advance(READ_THROTTLE_MS);
            expect(sendRead.mock.calls).toEqual([[7, 5], [7, 8]]);
        });

        it('sends nothing without an open group, while hidden, or while disconnected', async () => {
            await render({ openGroupId: null, messages: msgs(5) });
            visibility = 'hidden';
            await render({ openGroupId: 7, messages: msgs(5) });
            visibility = 'visible';
            await render({ openGroupId: 7, messages: msgs(5), isConnected: false });
            await advance(READ_THROTTLE_MS * 2);
            expect(sendRead).not.toHaveBeenCalled();
        });

        it('acks when the tab becomes visible again', async () => {
            visibility = 'hidden';
            await render({ openGroupId: 7, messages: msgs(5) });
            expect(sendRead).not.toHaveBeenCalled();

            visibility = 'visible';
            await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
            await advance(READ_THROTTLE_MS);
            expect(sendRead.mock.calls).toEqual([[7, 5]]);
        });

        it('acks once the socket connects', async () => {
            await render({ openGroupId: 7, messages: msgs(5), isConnected: false });
            expect(sendRead).not.toHaveBeenCalled();
            await render({ openGroupId: 7, messages: msgs(5), isConnected: true });
            expect(sendRead.mock.calls).toEqual([[7, 5]]);
        });

        it('retries when the send did not go out (returned false)', async () => {
            sendRead.mockReturnValueOnce(false);
            await render({ openGroupId: 7, messages: msgs(5) });
            expect(sendRead).toHaveBeenCalledTimes(1);

            await render({ openGroupId: 7, messages: msgs(5, 6) });
            await advance(READ_THROTTLE_MS);
            expect(sendRead.mock.calls.at(-1)).toEqual([7, 6]);
        });

        it('acks a different group immediately when the user switches', async () => {
            await render({ openGroupId: 7, messages: msgs(5) });
            await render({ openGroupId: 8, messages: msgs(20) });
            expect(sendRead.mock.calls).toEqual([[7, 5], [8, 20]]);
        });
    });
});
