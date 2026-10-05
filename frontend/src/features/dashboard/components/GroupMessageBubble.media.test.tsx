// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { GroupMessageBubble } from './GroupChatWindow';
import type { GroupMessageResponse } from '../../../types/api';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// GroupChatWindow arrastra el contexto del dashboard; el bubble no lo usa,
// pero el módulo lo importa.
vi.mock('../context/DashboardContext', () => ({ useDashboard: vi.fn() }));

const baseMsg = (over: Partial<GroupMessageResponse>): GroupMessageResponse => ({
    MessageID: 1,
    GroupID: 5,
    SenderTelephon: '222',
    SenderUsername: 'bob',
    Message: '',
    Time: '2026-01-01T10:00:00Z',
    Edited: false,
    ...over,
});

describe('GroupMessageBubble media rendering', () => {
    let container: HTMLDivElement;
    let root: Root;

    const renderBubble = (
        msg: GroupMessageResponse,
        isMine = false,
        extra: Partial<ComponentProps<typeof GroupMessageBubble>> = {},
    ) => {
        act(() => {
            root.render(
                <GroupMessageBubble
                    msg={msg}
                    isMine={isMine}
                    replySender=""
                    onEdit={vi.fn()}
                    onDelete={vi.fn()}
                    onReply={vi.fn()}
                    onDeleteForMe={vi.fn()}
                    menuOpen={null}
                    setMenuOpen={vi.fn()}
                    {...extra}
                />,
            );
        });
    };

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    it('imagen: <img> con la URL y sin texto redundante', () => {
        renderBubble(baseMsg({ MediaType: 'image', MediaUrl: '/storage/a.png', Message: '/storage/a.png' }));
        const img = container.querySelector('img');
        expect(img?.getAttribute('src')).toBe('/storage/a.png');
        expect(img?.getAttribute('alt')).toBe('Imagen adjunta');
        expect(container.textContent).not.toContain('/storage/a.png');
    });

    it('video: <video controls> con la URL', () => {
        renderBubble(baseMsg({ MediaType: 'video', MediaUrl: '/storage/v.mp4', Message: '/storage/v.mp4' }));
        const video = container.querySelector('video');
        expect(video?.getAttribute('src')).toBe('/storage/v.mp4');
        expect(video?.hasAttribute('controls')).toBe(true);
    });

    it('audio: usa el AudioPlayer compartido (sin controles nativos)', () => {
        renderBubble(baseMsg({ MediaType: 'audio', MediaUrl: '/storage/n.webm', Message: '/storage/n.webm' }));
        const audio = container.querySelector('audio');
        expect(audio?.getAttribute('src')).toBe('/storage/n.webm');
        expect(audio?.hasAttribute('controls')).toBe(false);
    });

    it('documento: enlace con rel seguro y etiqueta "Documento"', () => {
        renderBubble(baseMsg({ MediaType: 'document', MediaUrl: '/storage/d.pdf', Message: '/storage/d.pdf' }));
        const a = container.querySelector('a');
        expect(a?.getAttribute('href')).toBe('/storage/d.pdf');
        expect(a?.getAttribute('target')).toBe('_blank');
        expect(a?.getAttribute('rel')).toBe('noopener noreferrer');
        expect(a?.textContent).toContain('Documento');
    });

    it('media con pie de foto distinto de la URL: muestra el texto', () => {
        renderBubble(baseMsg({ MediaType: 'video', MediaUrl: '/storage/v.mp4', Message: 'mira esto' }));
        expect(container.querySelector('video')).not.toBeNull();
        expect(container.textContent).toContain('mira esto');
    });

    it('MediaType sin MediaUrl: no renderiza media (no usa el texto como URL) y conserva el texto', () => {
        renderBubble(baseMsg({ MediaType: 'image', Message: 'javascript:alert(1)' }));
        expect(container.querySelector('img, video, audio, a')).toBeNull();
        expect(container.textContent).toContain('javascript:alert(1)');
    });

    it('texto plano: sin media', () => {
        renderBubble(baseMsg({ Message: 'hola grupo' }));
        expect(container.querySelector('img, video, audio, a')).toBeNull();
        expect(container.textContent).toContain('hola grupo');
    });

    it('sticker: <img> del pack dentro de una burbuja transparente', () => {
        renderBubble(baseMsg({
            MediaType: 'sticker',
            MediaUrl: '/stickers/basic/hola.webp',
            Message: '/stickers/basic/hola.webp',
        }));
        const img = container.querySelector('img');
        expect(img?.getAttribute('src')).toBe('/stickers/basic/hola.webp');
        expect(img?.getAttribute('alt')).toBe('Sticker con la palabra Hola');
        const bubble = img?.parentElement as HTMLElement;
        expect(bubble.className).not.toMatch(/bg-indigo-/);
        expect(bubble.className).not.toMatch(/bg-slate-/);
    });

    it('sticker propio: oculta "Editar" en el menú y conserva eliminar', () => {
        renderBubble(
            baseMsg({ MediaType: 'sticker', MediaUrl: '/stickers/basic/hola.webp', Message: '/stickers/basic/hola.webp' }),
            true,
            { menuOpen: baseMsg({}).MessageID },
        );
        expect(document.body.textContent).not.toContain('Editar');
        expect(document.body.textContent).toContain('Eliminar para todos');
    });

    it('sticker: las reacciones siguen disponibles', () => {
        renderBubble(
            baseMsg({
                MediaType: 'sticker',
                MediaUrl: '/stickers/basic/hola.webp',
                Message: '/stickers/basic/hola.webp',
                Reactions: [{ Emoji: '😂', Count: 3, Mine: false }],
            }),
            false,
            { onReact: vi.fn() },
        );
        const chip = Array.from(container.querySelectorAll<HTMLElement>('button'))
            .find(b => b.getAttribute('aria-label') === '😂 3');
        expect(chip).toBeTruthy();
    });
});
