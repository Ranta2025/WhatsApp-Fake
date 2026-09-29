// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import GroupMessageInput from './GroupMessageInput';
import { useDashboard, type DashboardContextValue } from '../context/DashboardContext';
import { useGroupMessaging, type UseGroupMessagingResult } from '../hooks/useGroupMessaging';
import { useVoiceRecorder, type UseVoiceRecorderOptions, type VoiceRecorder } from '../../../hooks/useVoiceRecorder';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../context/DashboardContext', () => ({ useDashboard: vi.fn() }));
vi.mock('../hooks/useGroupMessaging', () => ({ useGroupMessaging: vi.fn() }));
vi.mock('../../../hooks/useVoiceRecorder', async (orig) => ({
    ...(await orig<typeof import('../../../hooks/useVoiceRecorder')>()),
    useVoiceRecorder: vi.fn(),
}));
// El menú real sube archivos; aquí solo exponemos sus callbacks.
vi.mock('../../../components/MediaUploadMenu', () => ({
    default: ({ onUploadSuccess, onUploadError }: {
        onUploadSuccess: (url: string, type?: string | null) => void;
        onUploadError: (m: string) => void;
    }) => (
        <div data-testid="upload-menu">
            <button onClick={() => onUploadSuccess('/storage/p.png', 'image')}>fake-upload-ok</button>
            <button onClick={() => onUploadError('fallo')}>fake-upload-error</button>
        </div>
    ),
}));

const mockUseDashboard = vi.mocked(useDashboard);
const mockUseGroupMessaging = vi.mocked(useGroupMessaging);
const mockUseVoiceRecorder = vi.mocked(useVoiceRecorder);

describe('GroupMessageInput media', () => {
    let container: HTMLDivElement;
    let root: Root;
    const handleSend = vi.fn();
    const handleMediaUploadSuccess = vi.fn();
    const addToast = vi.fn();
    const startRecording = vi.fn();
    const stopRecording = vi.fn();
    const cancelRecording = vi.fn();
    let recorderOptions: UseVoiceRecorderOptions | null;
    let recorderState: Pick<VoiceRecorder, 'isRecording' | 'recordingTime'>;

    const setup = (opts: {
        role?: string;
        isConnected?: boolean;
        editingMessageId?: number | null;
    } = {}) => {
        mockUseDashboard.mockReturnValue({
            isConnected: opts.isConnected ?? true,
            selectedGroup: { ID: 5, UserRole: opts.role ?? 'member' },
            addToast,
        } as unknown as DashboardContextValue);
        mockUseGroupMessaging.mockReturnValue({
            handleSend,
            handleMediaUploadSuccess,
            handleTyping: vi.fn(),
            editingMessageId: opts.editingMessageId ?? null,
            editingMessageText: 'editando',
            handleEditMessageChange: vi.fn(),
            handleEditMessageSave: vi.fn(),
            handleEditMessageCancel: vi.fn(),
            replyingTo: null,
            cancelReply: vi.fn(),
        } as unknown as UseGroupMessagingResult);
        act(() => { root.render(<GroupMessageInput />); });
    };

    const byLabel = (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
    const click = (el: HTMLElement | null) => { act(() => { el?.click(); }); };
    const clickText = (text: string) => {
        const btn = Array.from(container.querySelectorAll('button')).find(b => b.textContent === text);
        click(btn ?? null);
    };

    beforeEach(() => {
        vi.clearAllMocks();
        recorderOptions = null;
        recorderState = { isRecording: false, recordingTime: 0 };
        mockUseVoiceRecorder.mockImplementation((options) => {
            recorderOptions = options;
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

    it('abre el menú de adjuntos y envía la media aunque el borrador esté vacío', () => {
        setup();
        expect(container.querySelector('[data-testid="upload-menu"]')).toBeNull();
        click(byLabel('Adjuntar archivo'));
        expect(container.querySelector('[data-testid="upload-menu"]')).not.toBeNull();
        clickText('fake-upload-ok');
        expect(handleMediaUploadSuccess).toHaveBeenCalledWith('/storage/p.png', 'image');
        expect(container.querySelector('[data-testid="upload-menu"]')).toBeNull();
    });

    it('error del menú de adjuntos: muestra un toast y cierra el menú', () => {
        setup();
        click(byLabel('Adjuntar archivo'));
        clickText('fake-upload-error');
        expect(addToast).toHaveBeenCalledWith({ type: 'error', message: 'fallo' });
        expect(container.querySelector('[data-testid="upload-menu"]')).toBeNull();
    });

    it('con borrador vacío muestra el micrófono y empieza a grabar', () => {
        setup();
        expect(byLabel('Enviar')).toBeNull();
        click(byLabel('Grabar nota de voz'));
        expect(startRecording).toHaveBeenCalledTimes(1);
    });

    it('la nota de voz subida se envía como audio', () => {
        setup();
        recorderOptions?.onRecorded('/storage/v.webm');
        expect(handleMediaUploadSuccess).toHaveBeenCalledWith('/storage/v.webm', 'audio');
        recorderOptions?.onUploadError();
        expect(addToast).toHaveBeenCalledWith({ type: 'error', message: 'No se pudo enviar la nota de voz' });
    });

    it('grabando: muestra tiempo y Cancelar, y el botón detiene y envía', () => {
        recorderState = { isRecording: true, recordingTime: 65 };
        setup();
        expect(container.textContent).toContain('1:05');
        expect(container.querySelector('textarea')).toBeNull();
        clickText('Cancelar');
        expect(cancelRecording).toHaveBeenCalledTimes(1);
        click(byLabel('Detener y enviar nota de voz'));
        expect(stopRecording).toHaveBeenCalledTimes(1);
    });

    it('con texto muestra Enviar (sin micrófono) y envía el texto recortado', () => {
        setup();
        const ta = container.querySelector('textarea') as HTMLTextAreaElement;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!;
        act(() => {
            setter.call(ta, '  hola  ');
            ta.dispatchEvent(new Event('input', { bubbles: true }));
        });
        expect(byLabel('Grabar nota de voz')).toBeNull();
        click(byLabel('Enviar'));
        expect(handleSend).toHaveBeenCalledWith('hola');
    });

    it('sin conexión: adjuntar y grabar quedan deshabilitados', () => {
        setup({ isConnected: false });
        expect(byLabel('Adjuntar archivo')?.disabled).toBe(true);
        expect(byLabel('Grabar nota de voz')?.disabled).toBe(true);
    });

    it('editando un mensaje: no hay adjuntar ni micrófono', () => {
        setup({ editingMessageId: 9 });
        expect(byLabel('Adjuntar archivo')).toBeNull();
        expect(byLabel('Grabar nota de voz')).toBeNull();
        expect(byLabel('Enviar')).not.toBeNull();
    });

    it('usuario que salió del grupo: solo el aviso, sin controles', () => {
        setup({ role: 'left' });
        expect(container.textContent).toContain('Ya no eres miembro de este grupo');
        expect(byLabel('Adjuntar archivo')).toBeNull();
        expect(byLabel('Grabar nota de voz')).toBeNull();
        expect(container.querySelector('textarea')).toBeNull();
    });

    it('si el rol pasa a left mientras graba, cancela la grabación', () => {
        recorderState = { isRecording: true, recordingTime: 3 };
        setup();
        expect(cancelRecording).not.toHaveBeenCalled();
        setup({ role: 'left' });
        expect(cancelRecording).toHaveBeenCalledTimes(1);
    });

    it('editar cierra el menú de adjuntos y no reaparece al terminar', () => {
        setup();
        click(byLabel('Adjuntar archivo'));
        expect(container.querySelector('[data-testid="upload-menu"]')).not.toBeNull();
        setup({ editingMessageId: 9 });
        setup({ editingMessageId: null });
        expect(container.querySelector('[data-testid="upload-menu"]')).toBeNull();
    });
});
