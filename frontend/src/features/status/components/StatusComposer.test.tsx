// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import StatusComposer from './StatusComposer';
import { useStatus } from '../context/StatusContext';

// Item 5 (M6b): StatusComposer's `getErrorMessage` narrowed with
// `axios.isAxiosError`, so a throw that is not a real AxiosError (test double,
// wrapped error, plain object) lost `response.data.error` / `.message`. The
// pre-TypeScript code read them structurally. This drives the real component.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../context/StatusContext', () => ({
    useStatus: vi.fn(),
}));

const mockUseStatus = vi.mocked(useStatus);

const findButton = (label: string) =>
    Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').trim() === label);

const setTextareaValue = (el: HTMLTextAreaElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
};

describe('StatusComposer error extraction', () => {
    let container: HTMLDivElement;
    let root: Root;
    const closeComposer = vi.fn();
    const publishStatus = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        mockUseStatus.mockReturnValue({
            composerOpen: true,
            closeComposer,
            publishStatus,
        } as unknown as ReturnType<typeof useStatus>);
    });

    afterEach(() => {
        act(() => { root.unmount(); });
        container.remove();
    });

    it('reads response.data.error from a plain (non-Axios) rejection', async () => {
        publishStatus.mockRejectedValue({ response: { data: { error: 'boom' } } });

        await act(async () => { root.render(<StatusComposer />); });
        await act(async () => { findButton('Texto')!.click(); });

        const textarea = document.querySelector('[aria-label="Texto del estado"]') as HTMLTextAreaElement;
        await act(async () => { setTextareaValue(textarea, 'hola'); });
        await act(async () => { findButton('Publicar')!.click(); await Promise.resolve(); });

        expect(document.body.textContent).toContain('boom');
    });

    it('reads .message from a plain rejection without a response body', async () => {
        publishStatus.mockRejectedValue({ message: 'plain failure' });

        await act(async () => { root.render(<StatusComposer />); });
        await act(async () => { findButton('Texto')!.click(); });

        const textarea = document.querySelector('[aria-label="Texto del estado"]') as HTMLTextAreaElement;
        await act(async () => { setTextareaValue(textarea, 'hola'); });
        await act(async () => { findButton('Publicar')!.click(); await Promise.resolve(); });

        expect(document.body.textContent).toContain('plain failure');
    });
});
