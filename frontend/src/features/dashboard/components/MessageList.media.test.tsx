// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import MessageList from './MessageList';
import { useDashboard, type DashboardContextValue } from '../context/DashboardContext';
import { useMessaging } from '../hooks/useMessaging';
import type { Message } from '../../../types/api';

// Pin del render de media del chat 1:1 (antes de extraer MediaContent): el
// refactor no debe cambiar qué se pinta por tipo de media ni cuándo se oculta
// el texto.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../context/DashboardContext', () => ({ useDashboard: vi.fn() }));
vi.mock('../hooks/useMessaging', () => ({ useMessaging: vi.fn() }));

const mockUseDashboard = vi.mocked(useDashboard);
const mockUseMessaging = vi.mocked(useMessaging);

const baseMessage = (over: Partial<Message>): Message => ({
    MessageID: 1,
    SenderTelephon: '222',
    Receptor: '111',
    Message: '',
    Status: 'enviado',
    Time: '2026-01-01T10:00:00Z',
    Edited: false,
    ...over,
});

describe('MessageList media rendering (1:1)', () => {
    let container: HTMLDivElement;
    let root: Root;

    const renderWith = (message: Message) => {
        mockUseDashboard.mockReturnValue({
            selected: { Number: '222' },
            focusedChat: {},
            messagesByChat: { '222': [message] },
            chatPaging: {},
            loadOlderMessages: vi.fn(),
            profile: { Telephon: '111' },
            globalWallpaper: null,
        } as unknown as DashboardContextValue);
        act(() => { root.render(<MessageList />); });
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockUseMessaging.mockReturnValue({
            editingMessageId: null,
            editingMessageText: '',
            messageMenuOpen: null,
            setMessageMenuOpen: vi.fn(),
        } as unknown as ReturnType<typeof useMessaging>);
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    it('imagen: <img> con la URL, sin texto redundante', () => {
        renderWith(baseMessage({ MediaType: 'image', MediaUrl: '/storage/a.png', Message: '/storage/a.png' }));
        const img = container.querySelector('img');
        expect(img?.getAttribute('src')).toBe('/storage/a.png');
        expect(img?.getAttribute('alt')).toBe('Imagen adjunta');
        expect(container.textContent).not.toContain('/storage/a.png');
    });

    it('imagen: clic abre la URL en otra pestaña', () => {
        const open = vi.spyOn(window, 'open').mockImplementation(() => null);
        renderWith(baseMessage({ MediaType: 'image', MediaUrl: '/storage/a.png' }));
        act(() => { container.querySelector('img')?.click(); });
        expect(open).toHaveBeenCalledWith('/storage/a.png', '_blank');
        open.mockRestore();
    });

    it('video: <video controls> con la URL', () => {
        renderWith(baseMessage({ MediaType: 'video', MediaUrl: '/storage/v.mp4' }));
        const video = container.querySelector('video');
        expect(video?.getAttribute('src')).toBe('/storage/v.mp4');
        expect(video?.hasAttribute('controls')).toBe(true);
    });

    it('audio: usa el AudioPlayer (audio con la URL, sin controles nativos)', () => {
        renderWith(baseMessage({ MediaType: 'audio', MediaUrl: '/storage/n.webm' }));
        const audio = container.querySelector('audio');
        expect(audio?.getAttribute('src')).toBe('/storage/n.webm');
        expect(audio?.hasAttribute('controls')).toBe(false);
    });

    it('documento: enlace seguro con etiqueta "Documento"', () => {
        renderWith(baseMessage({ MediaType: 'document', MediaUrl: '/storage/d.pdf' }));
        const a = container.querySelector('a');
        expect(a?.getAttribute('href')).toBe('/storage/d.pdf');
        expect(a?.getAttribute('target')).toBe('_blank');
        expect(a?.getAttribute('rel')).toBe('noopener noreferrer');
        expect(a?.textContent).toContain('Documento');
    });

    it('media con texto distinto de la URL: oculta el texto (comportamiento actual)', () => {
        renderWith(baseMessage({ MediaType: 'image', MediaUrl: '/storage/a.png', Message: 'mira esto' }));
        expect(container.querySelector('img')).not.toBeNull();
        expect(container.textContent).not.toContain('mira esto');
    });

    it('legado: texto con /media/audio/ sin MediaType se infiere como audio', () => {
        renderWith(baseMessage({ Message: 'https://x.test/media/audio/n.ogg' }));
        expect(container.querySelector('audio')?.getAttribute('src')).toBe('https://x.test/media/audio/n.ogg');
    });

    it('sin media: solo texto', () => {
        renderWith(baseMessage({ Message: 'hola' }));
        expect(container.querySelector('img, video, audio, a')).toBeNull();
        expect(container.textContent).toContain('hola');
    });

    it('MediaType sin URL: no pinta media y conserva el texto normal', () => {
        renderWith(baseMessage({ MediaType: 'image', Message: 'texto normal' }));
        expect(container.querySelector('img')).toBeNull();
        expect(container.textContent).toContain('texto normal');
    });
});
