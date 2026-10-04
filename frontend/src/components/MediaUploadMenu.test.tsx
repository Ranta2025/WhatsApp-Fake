// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { RefObject } from 'react';
import MediaUploadMenu from './MediaUploadMenu';

// Item 1 (M6b): `instanceof DOMException` narrowed getUserMedia rejections too
// far — a rejection that is not a real DOMException instance (test double,
// polyfill, wrapped error) lost its `.name`, so the NotAllowedError branch was
// skipped. The pre-TypeScript code read `err.name` structurally. Item 6a: stop
// the camera stream when the 2D canvas context is null instead of leaking it.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('MediaUploadMenu camera errors', () => {
    let container: HTMLDivElement;
    let anchor: HTMLDivElement;
    let root: Root;
    const onUploadError = vi.fn();
    const onUploadSuccess = vi.fn();
    const onClose = vi.fn();
    const getUserMedia = vi.fn();

    const findButton = (label: string) =>
        Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').includes(label));

    beforeEach(() => {
        vi.clearAllMocks();
        container = document.createElement('div');
        anchor = document.createElement('div');
        document.body.appendChild(container);
        document.body.appendChild(anchor);
        root = createRoot(container);
        Object.defineProperty(navigator, 'mediaDevices', {
            configurable: true,
            value: { getUserMedia },
        });
    });

    afterEach(() => {
        act(() => { root.unmount(); });
        container.remove();
        anchor.remove();
    });

    const renderMenu = async () => {
        const anchorRef: RefObject<HTMLElement | null> = { current: anchor };
        await act(async () => {
            root.render(
                <MediaUploadMenu
                    anchorRef={anchorRef}
                    onUploadSuccess={onUploadSuccess}
                    onUploadError={onUploadError}
                    onClose={onClose}
                />
            );
        });
    };

    it('recognizes a plain-object NotAllowedError rejection (structural .name, not instanceof DOMException)', async () => {
        getUserMedia.mockRejectedValue({ name: 'NotAllowedError' });
        await renderMenu();

        const cameraBtn = findButton('Cámara');
        expect(cameraBtn).toBeDefined();
        await act(async () => {
            cameraBtn!.click();
            await Promise.resolve();
        });

        expect(onUploadError).toHaveBeenCalledWith(
            'Permiso de cámara denegado. Permite el acceso a la cámara en tu navegador e intenta de nuevo.'
        );
    });

    it('stops the camera stream when the 2D context is unavailable', async () => {
        const track = { stop: vi.fn() };
        getUserMedia.mockResolvedValue({ getTracks: () => [track] });
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

        await renderMenu();
        const cameraBtn = findButton('Cámara');
        await act(async () => {
            cameraBtn!.click();
            await Promise.resolve();
        });

        const captureBtn = document.querySelector('[aria-label="Tomar foto"]');
        expect(captureBtn).not.toBeNull();
        await act(async () => {
            (captureBtn as HTMLElement).click();
            await Promise.resolve();
        });

        // `stop()` may run more than once (the state change also triggers the
        // stream-cleanup effect), but before the fix it was never called at all.
        expect(track.stop).toHaveBeenCalled();
        expect(onUploadError).toHaveBeenCalledWith('Error al capturar la foto.');
    });
});
