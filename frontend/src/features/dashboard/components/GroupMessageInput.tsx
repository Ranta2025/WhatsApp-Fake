import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { useDashboard } from '../context/DashboardContext';
import { useGroupMessaging } from '../hooks/useGroupMessaging';
import { isEscapeHandled } from '../../../hooks/useEscapeToClose';
import { useVoiceRecorder, formatRecordingTime } from '../../../hooks/useVoiceRecorder';
import { canSend } from '../lib/groupPermissions';
import MediaUploadMenu from '../../../components/MediaUploadMenu';
import StickerPanel from '../../stickers/StickerPanel';
import { previewMessage } from '../../../utils/format';

const GroupMessageInput = () => {
    const [text, setText] = useState('');
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const {
        handleSend, handleTyping, handleMediaUploadSuccess,
        editingMessageId, editingMessageText, handleEditMessageChange,
        handleEditMessageSave, handleEditMessageCancel,
        replyingTo, cancelReply,
    } = useGroupMessaging();

    const { isConnected, selectedGroup, addToast } = useDashboard();

    const [showAttachMenu, setShowAttachMenu] = useState(false);
    const attachButtonRef = useRef<HTMLButtonElement>(null);
    const [showStickerPanel, setShowStickerPanel] = useState(false);
    const stickerButtonRef = useRef<HTMLButtonElement>(null);
    // Los hooks van antes del return del rol 'left' (reglas de hooks).
    const { isRecording, recordingTime, startRecording, stopRecording, cancelRecording } = useVoiceRecorder({
        onRecorded: (url) => handleMediaUploadSuccess(url, 'audio'),
        onUploadError: () => addToast({ type: 'error', message: 'No se pudo enviar la nota de voz' }),
    });

    const isLeft = selectedGroup?.userRole === 'left';
    const isEditing = Boolean(editingMessageId);
    // Matriz de permisos (lib/groupPermissions.ts): un miembro sólo queda
    // restringido si el envío es solo-admins; admin nunca. `left` se maneja aparte.
    const restrictedSend = Boolean(selectedGroup) && !isLeft && !canSend(selectedGroup!.userRole, selectedGroup!);

    // Si el rol pasa a 'left' mientras se graba, soltar el micrófono sin subir.
    useEffect(() => {
        if (isLeft && isRecording) cancelRecording();
    }, [isLeft, isRecording, cancelRecording]);

    // Al quedar restringido en vivo (cambio de rol/settings) se cancelan la
    // edición y la respuesta pendientes, y se suelta el micrófono. El banner
    // reemplaza al composer, así que no puede quedar ningún modo a medias.
    useEffect(() => {
        if (!restrictedSend) return;
        if (isRecording) cancelRecording();
        if (editingMessageId) handleEditMessageCancel();
        if (replyingTo) cancelReply();
    }, [restrictedSend, isRecording, cancelRecording, editingMessageId, handleEditMessageCancel, replyingTo, cancelReply]);

    // Entrar en modo edición desmonta el adjuntar y los stickers: cerrar los
    // paneles para que no reaparezcan.
    // Ajuste de estado durante el render (patrón de React), sin efecto.
    if (isEditing && showAttachMenu) setShowAttachMenu(false);
    if (isEditing && showStickerPanel) setShowStickerPanel(false);

    // If the user has left the group, show a read-only banner. Wording differs
    // when the cause is an admin removal vs. a voluntary leave (`RemovedByAdmin`).
    if (isLeft) {
        return (
            <div data-testid="group-composer-left" className="flex-shrink-0 border-t border-fg/5 bg-slate-900/95 backdrop-blur-md px-4 py-4 flex items-center justify-center gap-2 text-slate-500 text-sm italic">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
                {selectedGroup?.RemovedByAdmin
                    ? 'Un admin te eliminó de este grupo'
                    : 'Ya no eres miembro de este grupo'}
            </div>
        );
    }

    // Restricted members cannot send: same disabled-composer pattern as `left`
    // (attach / voice / emoji hidden; reply and edit already cancelled above).
    if (restrictedSend) {
        return (
            <div data-testid="group-composer-restricted" className="flex-shrink-0 border-t border-fg/5 bg-slate-900/95 backdrop-blur-md px-4 py-4 flex items-center justify-center gap-2 text-slate-500 text-sm italic">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
                Solo los admins pueden enviar mensajes
            </div>
        );
    }

    const onSend = () => {
        if (!text.trim()) return;
        handleSend(text.trim());
        setText('');
    };

    const handleStickerSelect = (url: string) => {
        // Media stays online-only; the panel is usable offline, but sending
        // surfaces the same toast the media path would show and queues nothing.
        if (!isConnected) {
            addToast({ type: 'error', message: 'No hay conexión con el servidor' });
            return;
        }
        handleMediaUploadSuccess(url, 'sticker');
    };

    const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (editingMessageId) {
                handleEditMessageSave();
            } else {
                onSend();
            }
        }
        if (e.key === 'Escape') {
            // Si alguna capa de overlay (modal/popover, incluido este mismo
            // panel de grupo) ya manejó este Escape vía useEscapeToClose, no
            // cancelar también la respuesta/edición en la misma pulsación
            // (ver R3-escape-capture-swallows-unregistered-handlers): el
            // hook ya no usa stopPropagation, así que sin este chequeo
            // cerrar un popover ajeno y cancelar la edición ocurrirían a la
            // vez con una sola tecla.
            if (isEscapeHandled(e)) return;
            if (editingMessageId) handleEditMessageCancel();
            if (replyingTo) cancelReply();
        }
    };

    // Switch between edit mode and regular mode
    const inputValue   = editingMessageId ? editingMessageText : text;
    const inputOnChange = editingMessageId
        ? handleEditMessageChange
        : (e: ChangeEvent<HTMLTextAreaElement>) => { setText(e.target.value); handleTyping(); };

    return (
        <div className="flex-shrink-0 border-t border-fg/5 bg-slate-900/95 backdrop-blur-md">
            {/* Reply banner */}
            {replyingTo && !editingMessageId && (
                <div className="flex items-center gap-2 px-4 py-2 bg-indigo-900/30 border-b border-indigo-500/20">
                    <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-indigo-400">
                            Respondiendo a {replyingTo.senderUsername || replyingTo.senderTelephon}
                        </div>
                        <div className="text-xs text-slate-400 truncate">{previewMessage(replyingTo)}</div>
                    </div>
                    <button onClick={cancelReply} className="text-slate-500 hover:text-fg transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            )}

            {/* Edit banner */}
            {editingMessageId && (
                <div className="flex items-center gap-2 px-4 py-2 bg-amber-900/20 border-b border-amber-500/20">
                    <svg className="w-4 h-4 text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    <span className="text-xs text-amber-300 flex-1">Editando mensaje</span>
                    <button onClick={handleEditMessageCancel} className="text-slate-500 hover:text-fg transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            )}

            {/* Input row */}
            <div className="flex items-end gap-2 px-3 py-3">
                {!editingMessageId && (
                    <div className="relative">
                        <button
                            ref={attachButtonRef}
                            onClick={() => setShowAttachMenu(!showAttachMenu)}
                            disabled={!isConnected || isRecording}
                            className="p-2.5 text-slate-400 hover:text-slate-200 hover:bg-fg/[0.06] disabled:opacity-40 disabled:cursor-not-allowed rounded-full transition-all flex-shrink-0"
                            aria-label="Adjuntar archivo"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 transform -rotate-45">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                            </svg>
                        </button>
                        {showAttachMenu && (
                            <MediaUploadMenu
                                anchorRef={attachButtonRef}
                                onUploadSuccess={(url, type) => { handleMediaUploadSuccess(url, type); setShowAttachMenu(false); }}
                                onUploadError={(err) => { addToast({ type: 'error', message: String(err) }); setShowAttachMenu(false); }}
                                onClose={() => setShowAttachMenu(false)}
                            />
                        )}
                    </div>
                )}
                {!editingMessageId && (
                    <div className="relative">
                        <button
                            ref={stickerButtonRef}
                            onClick={() => setShowStickerPanel(!showStickerPanel)}
                            disabled={isRecording}
                            className="p-2.5 text-slate-400 hover:text-slate-200 hover:bg-fg/[0.06] disabled:opacity-40 disabled:cursor-not-allowed rounded-full transition-all flex-shrink-0"
                            aria-label="Stickers"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z" />
                            </svg>
                        </button>
                        {showStickerPanel && (
                            <StickerPanel
                                anchorRef={stickerButtonRef}
                                onSelect={handleStickerSelect}
                                onClose={() => setShowStickerPanel(false)}
                            />
                        )}
                    </div>
                )}
                {isRecording ? (
                    <div className="flex-1 min-h-[42px] flex items-center justify-between px-4 text-red-400 bg-slate-800 border border-fg/10 rounded-2xl">
                        <div className="flex items-center gap-3">
                            <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></div>
                            <span className="font-mono text-sm">{formatRecordingTime(recordingTime)}</span>
                        </div>
                        <button onClick={cancelRecording} className="text-red-400 hover:text-red-300 text-sm font-medium">Cancelar</button>
                    </div>
                ) : (
                    <textarea
                        ref={inputRef}
                        rows={1}
                        value={inputValue}
                        onChange={inputOnChange}
                        onKeyDown={onKeyDown}
                        // El texto se puede escribir sin conexión: va al outbox (igual que el 1:1).
                        // Solo adjuntos/media/voz siguen siendo online-only.
                        placeholder={isConnected ? 'Escribe un mensaje en el grupo...' : 'Sin conexión...'}
                        className="flex-1 resize-none bg-slate-800 border border-fg/10 rounded-2xl px-4 py-2.5 text-fg placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm leading-relaxed disabled:opacity-50 max-h-36 overflow-auto transition-all"
                        style={{ height: 'auto', minHeight: '42px' }}
                        onInput={e => {
                            const el = e.currentTarget;
                            el.style.height = 'auto';
                            el.style.height = Math.min(el.scrollHeight, 144) + 'px';
                        }}
                    />
                )}
                {!isRecording && (editingMessageId || text.trim()) ? (
                    <button
                        onClick={editingMessageId ? handleEditMessageSave : onSend}
                        // Nuevo texto: habilitado offline (outbox). Edición: online-only.
                        disabled={editingMessageId ? !isConnected || !editingMessageText.trim() : !text.trim()}
                        className="p-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-on-accent rounded-full transition-all flex-shrink-0 shadow-lg"
                        aria-label="Enviar"
                    >
                        {editingMessageId ? (
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                        ) : (
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                            </svg>
                        )}
                    </button>
                ) : (
                    <button
                        onClick={isRecording ? stopRecording : startRecording}
                        disabled={!isConnected}
                        className={`p-2.5 disabled:opacity-40 disabled:cursor-not-allowed text-on-accent rounded-full transition-all flex-shrink-0 shadow-lg ${isRecording ? 'bg-rose-500 animate-pulse' : 'bg-indigo-600 hover:bg-indigo-500'}`}
                        aria-label={isRecording ? 'Detener y enviar nota de voz' : 'Grabar nota de voz'}
                    >
                        {isRecording ? (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                <path fillRule="evenodd" d="M4.5 7.5a3 3 0 013-3h9a3 3 0 013 3v9a3 3 0 01-3 3h-9a3 3 0 01-3-3v-9z" clipRule="evenodd" />
                            </svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                <path d="M8.25 4.5a3.75 3.75 0 117.5 0v8.25a3.75 3.75 0 11-7.5 0V4.5z" />
                                <path d="M6 10.5a.75.75 0 01.75.75v1.5a5.25 5.25 0 1010.5 0v-1.5a.75.75 0 011.5 0v1.5a6.751 6.751 0 01-6 6.709v2.291h3a.75.75 0 010 1.5h-7.5a.75.75 0 010-1.5h3v-2.291a6.751 6.751 0 01-6-6.709v-1.5A.75.75 0 016 10.5z" />
                            </svg>
                        )}
                    </button>
                )}
            </div>
        </div>
    );
};

export default GroupMessageInput;
