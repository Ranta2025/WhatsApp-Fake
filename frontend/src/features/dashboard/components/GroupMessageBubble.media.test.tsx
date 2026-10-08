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
    messageID: 1,
    groupID: 5,
    senderTelephon: '222',
    senderUsername: 'bob',
    message: '',
    time: '2026-01-01T10:00:00Z',
    edited: false,
    ...over,
});

/**
 * Locates the message bubble structurally: the closest ancestor of the image
 * that also carries the footer (a direct child div holding the timestamp).
 * The image's immediate parent is not enough: MediaContent wraps the <img> for
 * image/video media, so that parent is the wrapper, not the bubble.
 */
const findBubble = (img: HTMLElement): HTMLElement | null => {
    let node: HTMLElement | null = img.parentElement;
    while (node) {
        const holdsFooter = Array.from(node.children).some(
            (child) => child.tagName === 'DIV' && !child.contains(img) && /\d{1,2}:\d{2}/.test(child.textContent ?? ''),
        );
        if (holdsFooter) return node;
        node = node.parentElement;
    }
    return null;
};

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
        renderBubble(baseMsg({ mediaType: 'image', mediaUrl: '/storage/a.png', message: '/storage/a.png' }));
        const img = container.querySelector('img');
        expect(img?.getAttribute('src')).toBe('/storage/a.png');
        expect(img?.getAttribute('alt')).toBe('Imagen adjunta');
        expect(container.textContent).not.toContain('/storage/a.png');
    });

    it('video: <video controls> con la URL', () => {
        renderBubble(baseMsg({ mediaType: 'video', mediaUrl: '/storage/v.mp4', message: '/storage/v.mp4' }));
        const video = container.querySelector('video');
        expect(video?.getAttribute('src')).toBe('/storage/v.mp4');
        expect(video?.hasAttribute('controls')).toBe(true);
    });

    it('audio: usa el AudioPlayer compartido (sin controles nativos)', () => {
        renderBubble(baseMsg({ mediaType: 'audio', mediaUrl: '/storage/n.webm', message: '/storage/n.webm' }));
        const audio = container.querySelector('audio');
        expect(audio?.getAttribute('src')).toBe('/storage/n.webm');
        expect(audio?.hasAttribute('controls')).toBe(false);
    });

    it('documento: enlace con rel seguro y etiqueta "Documento"', () => {
        renderBubble(baseMsg({ mediaType: 'document', mediaUrl: '/storage/d.pdf', message: '/storage/d.pdf' }));
        const a = container.querySelector('a');
        expect(a?.getAttribute('href')).toBe('/storage/d.pdf');
        expect(a?.getAttribute('target')).toBe('_blank');
        expect(a?.getAttribute('rel')).toBe('noopener noreferrer');
        expect(a?.textContent).toContain('Documento');
    });

    it('media con pie de foto distinto de la URL: muestra el texto', () => {
        renderBubble(baseMsg({ mediaType: 'video', mediaUrl: '/storage/v.mp4', message: 'mira esto' }));
        expect(container.querySelector('video')).not.toBeNull();
        expect(container.textContent).toContain('mira esto');
    });

    it('mediaType sin mediaUrl: no renderiza media (no usa el texto como URL) y conserva el texto', () => {
        renderBubble(baseMsg({ mediaType: 'image', message: 'javascript:alert(1)' }));
        expect(container.querySelector('img, video, audio, a')).toBeNull();
        expect(container.textContent).toContain('javascript:alert(1)');
    });

    it('texto plano: sin media', () => {
        renderBubble(baseMsg({ message: 'hola grupo' }));
        expect(container.querySelector('img, video, audio, a')).toBeNull();
        expect(container.textContent).toContain('hola grupo');
    });

    it('sticker: <img> del pack dentro de una burbuja transparente', () => {
        renderBubble(baseMsg({
            mediaType: 'sticker',
            mediaUrl: '/stickers/basic/hola.webp',
            message: '/stickers/basic/hola.webp',
        }));
        const img = container.querySelector('img') as HTMLImageElement;
        expect(img.getAttribute('src')).toBe('/stickers/basic/hola.webp');
        expect(img.getAttribute('alt')).toBe('Sticker con la palabra Hola');
        const bubble = findBubble(img);
        expect(bubble).not.toBeNull();
        expect(bubble!.className).not.toMatch(/bg-indigo-/);
        expect(bubble!.className).not.toMatch(/bg-slate-/);
    });

    it('control positivo: una burbuja no-sticker sí lleva fondo', () => {
        renderBubble(
            baseMsg({ mediaType: 'image', mediaUrl: '/storage/a.png', message: '/storage/a.png' }),
            true,
        );
        const img = container.querySelector('img') as HTMLImageElement;
        const bubble = findBubble(img);
        expect(bubble).not.toBeNull();
        expect(bubble!.className).toMatch(/bg-indigo-/);
    });

    it('cita de respuesta a un sticker: muestra ✨ Sticker y no la URL cruda', () => {
        renderBubble(baseMsg({
            mediaType: 'sticker',
            mediaUrl: '/stickers/basic/hola.webp',
            message: '/stickers/basic/hola.webp',
            replyToMessageID: 0,
            replyToTelephon: '222',
            replyToMessage: '/stickers/basic/hola.webp',
        }));
        expect(container.textContent).toContain('✨ Sticker');
        expect(container.textContent).not.toContain('/stickers/basic/hola.webp');
    });

    it('sticker propio: oculta "Editar" en el menú y conserva eliminar', () => {
        renderBubble(
            baseMsg({ mediaType: 'sticker', mediaUrl: '/stickers/basic/hola.webp', message: '/stickers/basic/hola.webp' }),
            true,
            { menuOpen: baseMsg({}).messageID },
        );
        expect(document.body.textContent).not.toContain('Editar');
        expect(document.body.textContent).toContain('Eliminar para todos');
    });

    it('sticker: las reacciones siguen disponibles', () => {
        renderBubble(
            baseMsg({
                mediaType: 'sticker',
                mediaUrl: '/stickers/basic/hola.webp',
                message: '/stickers/basic/hola.webp',
                reactions: [{ emoji: '😂', count: 3, mine: false }],
            }),
            false,
            { onReact: vi.fn() },
        );
        const chip = Array.from(container.querySelectorAll<HTMLElement>('button'))
            .find(b => b.getAttribute('aria-label') === '😂 3');
        expect(chip).toBeTruthy();
    });
});
