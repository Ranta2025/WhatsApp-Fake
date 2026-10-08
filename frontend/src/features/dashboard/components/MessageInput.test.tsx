// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import MessageInput from './MessageInput';
import { useDashboard, type DashboardContextValue } from '../context/DashboardContext';
import { useMessaging } from '../hooks/useMessaging';
import { useVoiceRecorder, type VoiceRecorder } from '../../../hooks/useVoiceRecorder';
import type { Message } from '../../../types/api';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../context/DashboardContext', () => ({ useDashboard: vi.fn() }));
vi.mock('../hooks/useMessaging', () => ({ useMessaging: vi.fn() }));
vi.mock('../../../hooks/useVoiceRecorder', async (orig) => ({
    ...(await orig<typeof import('../../../hooks/useVoiceRecorder')>()),
    useVoiceRecorder: vi.fn(),
}));
// The real panel is covered by StickerPanel.test.tsx; here we only exercise
// the composer wiring (open, send as 'sticker', close, offline, banner).
vi.mock('../../stickers/StickerPanel', () => ({
    default: ({ onSelect, onClose }: { onSelect: (url: string) => void; onClose: () => void }) => (
        <div data-testid="sticker-panel">
            <button type="button" onClick={() => { onSelect('/stickers/basic/hola.webp'); onClose(); }}>fake-sticker</button>
            <button type="button" onClick={onClose}>fake-sticker-close</button>
        </div>
    ),
}));

const mockUseDashboard = vi.mocked(useDashboard);
const mockUseMessaging = vi.mocked(useMessaging);
const mockUseVoiceRecorder = vi.mocked(useVoiceRecorder);

describe('MessageInput sticker sending', () => {
    let container: HTMLDivElement;
    let root: Root;
    const handleSend = vi.fn();
    const handleMediaUploadSuccess = vi.fn();
    const addToast = vi.fn();
    const startRecording = vi.fn();
    const stopRecording = vi.fn();
    const cancelRecording = vi.fn();
    const cancelReply = vi.fn();
    // Mutable so a case can force the recording state before rendering.
    let recorderState: Pick<VoiceRecorder, 'isRecording' | 'recordingTime'>;

    const setup = (opts: {
        isConnected?: boolean;
        replyingTo?: Message | null;
    } = {}) => {
        mockUseDashboard.mockReturnValue({
            selected: { telephon: '111', username: 'Yo', contactName: null },
            isConnected: opts.isConnected ?? true,
            profile: { telephon: '999' },
            drafts: {},
            setDrafts: vi.fn(),
            sendTypingIndicator: vi.fn(),
            addToast,
        } as unknown as DashboardContextValue);
        mockUseMessaging.mockReturnValue({
            handleSend,
            handleMediaUploadSuccess,
            replyingTo: opts.replyingTo ?? null,
            cancelReply,
        } as unknown as ReturnType<typeof useMessaging>);
        act(() => { root.render(<MessageInput />); });
    };

    const byLabel = (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
    const click = (el: HTMLElement | null) => { act(() => { el?.click(); }); };
    const clickText = (text: string) => {
        const btn = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent === text);
        click(btn ?? null);
    };

    beforeEach(() => {
        vi.clearAllMocks();
        recorderState = { isRecording: false, recordingTime: 0 };
        mockUseVoiceRecorder.mockImplementation(() => {
            return { ...recorderState, startRecording, stopRecording, cancelRecording };
        });
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    it('opens the sticker panel from the Stickers button', () => {
        setup();
        expect(container.querySelector('[data-testid="sticker-panel"]')).toBeNull();
        click(byLabel('Stickers'));
        expect(container.querySelector('[data-testid="sticker-panel"]')).not.toBeNull();
    });

    it('selecting a sticker sends it with type sticker and closes the panel', () => {
        setup();
        click(byLabel('Stickers'));
        clickText('fake-sticker');
        expect(handleMediaUploadSuccess).toHaveBeenCalledWith('/stickers/basic/hola.webp', 'sticker');
        expect(container.querySelector('[data-testid="sticker-panel"]')).toBeNull();
    });

    it('offline: shows the connection toast and sends nothing', () => {
        setup({ isConnected: false });
        click(byLabel('Stickers'));
        clickText('fake-sticker');
        expect(addToast).toHaveBeenCalledWith({ type: 'error', message: 'No hay conexión con el servidor' });
        expect(handleMediaUploadSuccess).not.toHaveBeenCalled();
    });

    it('reply banner shows the sticker label, not the raw url', () => {
        const reply: Message = {
            MessageID: 7, SenderTelephon: '111', Receptor: '999',
            Message: '/stickers/basic/hola.webp', Status: 'enviado',
            Time: '2026-01-01T10:00:00Z', Edited: false,
            MediaType: 'sticker', MediaUrl: '/stickers/basic/hola.webp',
        };
        setup({ replyingTo: reply });
        expect(container.textContent).toContain('✨ Sticker');
        expect(container.textContent).not.toContain('/stickers/basic/hola.webp');
    });

    it('RF9: a plain-text reply still shows its text in the banner', () => {
        const reply: Message = {
            MessageID: 8, SenderTelephon: '111', Receptor: '999',
            Message: 'texto plano', Status: 'enviado',
            Time: '2026-01-01T10:00:00Z', Edited: false,
        };
        setup({ replyingTo: reply });
        expect(container.textContent).toContain('texto plano');
        expect(container.textContent).not.toContain('✨ Sticker');
    });

    it('RF8: recording disables the Stickers button and keeps the panel closed', () => {
        recorderState = { isRecording: true, recordingTime: 5 };
        setup();
        expect(byLabel('Stickers')?.disabled).toBe(true);
        click(byLabel('Stickers'));
        expect(container.querySelector('[data-testid="sticker-panel"]')).toBeNull();
    });
});
