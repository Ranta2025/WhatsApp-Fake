// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import MessageTicks from './MessageTicks';
import type { MessageStatus } from '../../../types/api';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('MessageTicks', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });
    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    const svg = (status: MessageStatus | 'pending') => {
        act(() => { root.render(<MessageTicks status={status} />); });
        return container.querySelector('svg');
    };

    it('single grey check for "enviado"', () => {
        const el = svg('enviado');
        expect(el?.getAttribute('aria-label')).toBe('Enviado');
        expect(el?.querySelectorAll('path')).toHaveLength(1);
        expect(el?.getAttribute('class')).toContain('text-white/60');
    });

    it('double grey check for "entregado"', () => {
        const el = svg('entregado');
        expect(el?.getAttribute('aria-label')).toBe('Entregado');
        expect(el?.querySelectorAll('path')).toHaveLength(2);
        expect(el?.getAttribute('class')).toContain('text-white/60');
    });

    it('double blue check for "visto"', () => {
        const el = svg('visto');
        expect(el?.getAttribute('aria-label')).toBe('Visto');
        expect(el?.querySelectorAll('path')).toHaveLength(2);
        expect(el?.getAttribute('class')).toContain('text-sky-300');
    });

    it('clock for "pending" (outbox), with a stable test id', () => {
        const el = svg('pending');
        expect(el?.getAttribute('aria-label')).toBe('Pendiente de envío');
        expect(el?.getAttribute('data-testid')).toBe('message-pending');
    });
});
