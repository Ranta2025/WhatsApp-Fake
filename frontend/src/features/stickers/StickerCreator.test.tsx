// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import StickerCreator from './StickerCreator';
import { uploadSticker } from '../../api/stickerApi';
import type { Sticker } from '../../types/api';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../../api/stickerApi', () => ({ uploadSticker: vi.fn() }));
const uploadMock = vi.mocked(uploadSticker);

const sticker: Sticker = {
    id: 7,
    url: '/storage/bucket/stickers/abc.webp',
    sha256: 'a'.repeat(64),
    animated: false,
    favorite: false,
    tags: ['hola'],
    createdAt: '2026-01-01T00:00:00Z',
};

/** Minimal 2D context; the creator only paints and clips on it. */
function mockContext(): CanvasRenderingContext2D {
    return {
        clearRect: vi.fn(),
        drawImage: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        roundRect: vi.fn(),
        clip: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
}

/** Fires the React onload synchronously once `src` is assigned. */
class MockImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = 800;
    naturalHeight = 600;
    crossOrigin: string | null = null;
    private source = '';
    set src(value: string) {
        this.source = value;
        queueMicrotask(() => this.onload?.());
    }
    get src(): string {
        return this.source;
    }
}

/** Animated WebP: RIFF/WEBP + VP8X with the ANIM flag set. */
function animatedWebpFile(name = 'animado.webp'): File {
    const bytes = new Uint8Array([
        0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0,
        0x57, 0x45, 0x42, 0x50,
        0x56, 0x50, 0x38, 0x58, 10, 0, 0, 0,
        0x02, 0, 0, 0, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    ]);
    return new File([bytes], name, { type: 'image/webp' });
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('StickerCreator', () => {
    let container: HTMLDivElement;
    let root: Root;
    let toBlob: typeof HTMLCanvasElement.prototype.toBlob;

    const onCreated = vi.fn();
    const onSend = vi.fn();
    const onClose = vi.fn();

    const render = () => {
        act(() => {
            root.render(
                <StickerCreator onCreated={onCreated} onSend={onSend} onClose={onClose} />,
            );
        });
    };

    const pick = async (file: File) => {
        const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
        await act(async () => {
            Object.defineProperty(input, 'files', { configurable: true, value: [file] });
            input.dispatchEvent(new Event('change', { bubbles: true }));
            await tick();
        });
    };

    const clickCreate = async () => {
        const button = Array.from(container.querySelectorAll('button'))
            .find((item) => item.textContent?.includes('Crear sticker'))!;
        await act(async () => {
            button.click();
            await tick();
            await tick();
        });
    };

    beforeEach(() => {
        vi.clearAllMocks();
        uploadMock.mockResolvedValue(sticker);
        globalThis.IS_REACT_ACT_ENVIRONMENT = true;

        vi.stubGlobal('Image', MockImage);
        vi.stubGlobal('createImageBitmap', vi.fn(async () => ({
            width: 512, height: 512, close: vi.fn(),
        })));
        URL.createObjectURL = vi.fn(() => 'blob:mock');
        URL.revokeObjectURL = vi.fn();
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(mockContext());

        toBlob = HTMLCanvasElement.prototype.toBlob;
        HTMLCanvasElement.prototype.toBlob = function (callback: BlobCallback, type?: string) {
            callback(new Blob([new Uint8Array(1000)], { type: type ?? 'image/webp' }));
        };

        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        HTMLCanvasElement.prototype.toBlob = toBlob;
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        Reflect.deleteProperty(URL, 'createObjectURL');
        Reflect.deleteProperty(URL, 'revokeObjectURL');
        document.body.innerHTML = '';
    });

    it('rejects a GIF with Spanish guidance and never uploads', async () => {
        render();
        await pick(new File(['gif'], 'baile.gif', { type: 'image/gif' }));

        expect(container.querySelector('[role="alert"]')?.textContent)
            .toContain('GIF no son compatibles');
        expect(uploadMock).not.toHaveBeenCalled();
    });

    it('uploads an animated 512x512 WebP as-is, without re-encoding', async () => {
        render();
        const file = animatedWebpFile();
        await pick(file);

        expect(container.querySelector('input[type="file"]')).not.toBeNull();
        await clickCreate();

        expect(uploadMock).toHaveBeenCalledTimes(1);
        expect(uploadMock.mock.calls[0]![0]).toBe(file);
        expect(onCreated).toHaveBeenCalledWith(sticker);
        expect(onSend).not.toHaveBeenCalled();
        // The animated path never touches a canvas context.
        expect(HTMLCanvasElement.prototype.getContext).not.toHaveBeenCalled();
    });

    it('rejects an animated WebP that is not exactly 512x512', async () => {
        vi.stubGlobal('createImageBitmap', vi.fn(async () => ({
            width: 256, height: 256, close: vi.fn(),
        })));
        render();
        await pick(animatedWebpFile());

        expect(container.querySelector('[role="alert"]')?.textContent)
            .toContain('512');
        expect(uploadMock).not.toHaveBeenCalled();
    });

    it('crops, encodes and uploads a static image with normalised tags', async () => {
        render();
        await pick(new File(['jpg'], 'foto.jpg', { type: 'image/jpeg' }));

        const tags = container.querySelector<HTMLInputElement>('input[type="text"]')!;
        await act(async () => {
            // Bypass React's value tracker so the controlled onChange fires.
            const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
            setValue.call(tags, 'Hola, AMOR , hola');
            tags.dispatchEvent(new Event('input', { bubbles: true }));
        });

        await clickCreate();

        expect(uploadMock).toHaveBeenCalledTimes(1);
        const [file, csv] = uploadMock.mock.calls[0]!;
        expect(file).toBeInstanceOf(File);
        expect(file.name).toBe('sticker.webp');
        expect(file.type).toBe('image/webp');
        expect(csv).toBe('hola,amor');
        expect(onCreated).toHaveBeenCalledWith(sticker);
    });

    it('falls back to PNG when the encoder does not produce WebP (Safari)', async () => {
        HTMLCanvasElement.prototype.toBlob = function (callback: BlobCallback) {
            callback(new Blob([new Uint8Array(1000)], { type: 'image/png' }));
        };
        render();
        await pick(new File(['jpg'], 'foto.jpg', { type: 'image/jpeg' }));
        await clickCreate();

        const [file] = uploadMock.mock.calls[0]!;
        expect(file.name).toBe('sticker.png');
        expect(file.type).toBe('image/png');
    });

    it('shows the size-cap message when every quality is too big', async () => {
        HTMLCanvasElement.prototype.toBlob = function (callback: BlobCallback) {
            callback(new Blob([new Uint8Array(500 * 1024)], { type: 'image/webp' }));
        };
        render();
        await pick(new File(['jpg'], 'foto.jpg', { type: 'image/jpeg' }));
        await clickCreate();

        expect(container.querySelector('[role="alert"]')?.textContent)
            .toContain('300 KB');
        expect(uploadMock).not.toHaveBeenCalled();
    });

    it('sends right away when the send option is enabled', async () => {
        render();
        const file = animatedWebpFile();
        await pick(file);

        const sendBox = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))
            .find((box) => box.parentElement?.textContent?.includes('Enviar'))!;
        await act(async () => { sendBox.click(); });
        await clickCreate();

        expect(onSend).toHaveBeenCalledWith(sticker.url);
    });
});
