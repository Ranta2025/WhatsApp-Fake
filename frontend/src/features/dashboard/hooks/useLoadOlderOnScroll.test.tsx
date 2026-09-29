// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useLoadOlderOnScroll } from './useLoadOlderOnScroll';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

interface HarnessProps {
    chatKey: string;
    firstKey: number | undefined;
    lastKey: number | undefined;
    hasMore: boolean;
    loadingOlder: boolean;
    loadOlder: () => void;
    smoothTail?: boolean;
    onContainer: (el: HTMLDivElement) => void;
}

function Harness({ onContainer, chatKey, firstKey, lastKey, hasMore, loadingOlder, loadOlder, smoothTail }: HarnessProps) {
    const ref = useRef<HTMLDivElement>(null);
    useLoadOlderOnScroll({ containerRef: ref, chatKey, firstKey, lastKey, hasMore, loadingOlder, loadOlder, smoothTail });
    return <div ref={(el) => { (ref as { current: HTMLDivElement | null }).current = el; if (el) onContainer(el); }} />;
}

describe('useLoadOlderOnScroll', () => {
    let host: HTMLDivElement;
    let root: Root;
    let el: HTMLDivElement;
    let height = 500;

    beforeEach(() => {
        // rAF ejecuta el callback en el acto: el scroll a fondo queda determinista.
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 0; });
        height = 500;
        host = document.createElement('div');
        document.body.appendChild(host);
        root = createRoot(host);
    });

    afterEach(() => {
        act(() => root.unmount());
        host.remove();
        vi.unstubAllGlobals();
    });

    const base: Omit<HarnessProps, 'onContainer'> = {
        chatKey: 'A', firstKey: 5, lastKey: 6, hasMore: true, loadingOlder: false, loadOlder: vi.fn(),
    };

    const render = (over: Partial<Omit<HarnessProps, 'onContainer'>> = {}) => {
        act(() => {
            root.render(<Harness {...base} {...over} onContainer={(node) => {
                if (el !== node) {
                    el = node;
                    Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => height });
                }
            }} />);
        });
    };

    const scrollTo = (top: number) => {
        el.scrollTop = top;
        act(() => { el.dispatchEvent(new Event('scroll')); });
    };

    it('llama a loadOlder al llegar arriba con hasMore', () => {
        const loadOlder = vi.fn();
        render({ loadOlder });
        scrollTo(0);
        expect(loadOlder).toHaveBeenCalledTimes(1);
    });

    it('no llama a loadOlder lejos del tope, sin hasMore o mientras carga', () => {
        const loadOlder = vi.fn();
        render({ loadOlder });
        scrollTo(300);
        expect(loadOlder).not.toHaveBeenCalled();

        render({ loadOlder, hasMore: false });
        scrollTo(0);
        expect(loadOlder).not.toHaveBeenCalled();

        render({ loadOlder, hasMore: true, loadingOlder: true });
        scrollTo(0);
        expect(loadOlder).not.toHaveBeenCalled();
    });

    it('al abrir un chat y al llegar un mensaje al final baja al fondo', () => {
        render();
        expect(el.scrollTop).toBe(500);

        height = 560;
        render({ lastKey: 7 });
        expect(el.scrollTop).toBe(560);
    });

    it('al cambiar de chat baja al fondo', () => {
        render();
        height = 900;
        render({ chatKey: 'B', firstKey: 20, lastKey: 30 });
        expect(el.scrollTop).toBe(900);
    });

    it('al anteponer mensajes antiguos conserva la posición (sin saltar ni bajar al fondo)', () => {
        render();
        scrollTo(10); // el usuario está cerca del tope; métricas: top 10, altura 500

        height = 900; // llegó una página antigua: +400px por encima
        render({ firstKey: 3 });

        expect(el.scrollTop).toBe(410);
    });

    it('una edición (mismas claves) no mueve el scroll', () => {
        render();
        scrollTo(120);
        height = 520;
        render();
        expect(el.scrollTop).toBe(120);
    });

    it('con smoothTail usa scrollTo suave para el mensaje nuevo cuando existe', () => {
        render({ smoothTail: true });
        const spy = vi.fn();
        el.scrollTo = spy as unknown as typeof el.scrollTo;
        height = 600;
        render({ smoothTail: true, lastKey: 7 });
        expect(spy).toHaveBeenCalledWith({ top: 600, behavior: 'smooth' });
    });
});
