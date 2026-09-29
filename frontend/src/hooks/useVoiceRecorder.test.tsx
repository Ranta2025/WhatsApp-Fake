// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useVoiceRecorder, formatRecordingTime, type VoiceRecorder } from './useVoiceRecorder';
import api from '../api/axios';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../api/axios', () => ({ default: { post: vi.fn() } }));
const mockPost = vi.mocked(api.post);

class FakeRecorder {
    static last: FakeRecorder | null = null;
    ondataavailable: ((e: BlobEvent) => void) | null = null;
    onstop: (() => void | Promise<void>) | null = null;
    start = vi.fn();
    constructor(public stream: MediaStream) { FakeRecorder.last = this; }
    stop() {
        this.ondataavailable?.({ data: new Blob(['x']) } as BlobEvent);
        void this.onstop?.();
    }
}

describe('formatRecordingTime', () => {
    it('formatea m:ss', () => {
        expect(formatRecordingTime(0)).toBe('0:00');
        expect(formatRecordingTime(65)).toBe('1:05');
    });
});

describe('useVoiceRecorder', () => {
    let container: HTMLDivElement;
    let root: Root;
    const holder: { current: VoiceRecorder | null } = { current: null };
    const rec = (): VoiceRecorder => {
        if (!holder.current) throw new Error('hook not rendered');
        return holder.current;
    };
    const onRecorded = vi.fn();
    const onUploadError = vi.fn();
    const trackStop = vi.fn();

    const Probe = () => {
        const value = useVoiceRecorder({ onRecorded, onUploadError });
        useEffect(() => { holder.current = value; });
        return null;
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        FakeRecorder.last = null;
        const stream = { getTracks: () => [{ stop: trackStop }] } as unknown as MediaStream;
        Object.defineProperty(navigator, 'mediaDevices', {
            configurable: true,
            value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
        });
        vi.stubGlobal('MediaRecorder', FakeRecorder);
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        act(() => { root.render(<Probe />); });
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    const start = async () => { await act(async () => { await rec().startRecording(); }); };

    it('startRecording pone isRecording y cuenta segundos', async () => {
        await start();
        expect(rec().isRecording).toBe(true);
        expect(FakeRecorder.last?.start).toHaveBeenCalled();
        act(() => { vi.advanceTimersByTime(3000); });
        expect(rec().recordingTime).toBe(3);
    });

    it('stopRecording sube el audio y notifica la URL', async () => {
        mockPost.mockResolvedValue({ data: { url: '/storage/v.webm' } });
        await start();
        await act(async () => { rec().stopRecording(); });
        expect(rec().isRecording).toBe(false);
        expect(mockPost).toHaveBeenCalledTimes(1);
        expect(mockPost.mock.calls[0]?.[0]).toBe('/api/v1/upload');
        expect(onRecorded).toHaveBeenCalledWith('/storage/v.webm');
        expect(trackStop).toHaveBeenCalled();
    });

    it('tolera cuerpo null/sin url: no notifica ni falla', async () => {
        mockPost.mockResolvedValue({ data: null });
        await start();
        await act(async () => { rec().stopRecording(); });
        expect(onRecorded).not.toHaveBeenCalled();
        expect(onUploadError).not.toHaveBeenCalled();
    });

    it('error de subida: llama onUploadError y libera el micrófono', async () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        mockPost.mockRejectedValue(new Error('boom'));
        await start();
        await act(async () => { rec().stopRecording(); });
        expect(onUploadError).toHaveBeenCalledTimes(1);
        expect(onRecorded).not.toHaveBeenCalled();
        expect(trackStop).toHaveBeenCalled();
        spy.mockRestore();
    });

    it('cancelRecording no sube nada y libera el micrófono', async () => {
        await start();
        act(() => { rec().cancelRecording(); });
        expect(rec().isRecording).toBe(false);
        expect(rec().recordingTime).toBe(0);
        expect(mockPost).not.toHaveBeenCalled();
        expect(trackStop).toHaveBeenCalled();
    });

    it('sin permiso de micrófono: alerta y no graba', async () => {
        const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        Object.defineProperty(navigator, 'mediaDevices', {
            configurable: true,
            value: { getUserMedia: vi.fn().mockRejectedValue(new Error('denied')) },
        });
        await start();
        expect(alertSpy).toHaveBeenCalledWith('No se pudo acceder al micrófono.');
        expect(rec().isRecording).toBe(false);
        alertSpy.mockRestore();
        errSpy.mockRestore();
    });
});
