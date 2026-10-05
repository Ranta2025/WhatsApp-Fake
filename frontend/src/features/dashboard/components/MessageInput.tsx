import { useState, useRef, type ChangeEvent, type KeyboardEvent } from 'react';
import { useDashboard } from '../context/DashboardContext';
import { useMessaging } from '../hooks/useMessaging';
import MediaUploadMenu from '../../../components/MediaUploadMenu';
import StickerPanel from '../../stickers/StickerPanel';
import { useVoiceRecorder, formatRecordingTime } from '../../../hooks/useVoiceRecorder';
import { replySenderLabel } from '../lib/replyLabel';
import { previewMessage } from '../../../utils/format';

const MessageInput = () => {
    const { 
        selected, isConnected, profile, drafts, setDrafts, 
        sendTypingIndicator, addToast
    } = useDashboard();
    
    const { 
        replyingTo, cancelReply, handleMediaUploadSuccess, 
        handleSend: messagingHandleSend 
    } = useMessaging();

    const [showAttachMenu, setShowAttachMenu] = useState(false);
    const attachButtonRef = useRef<HTMLButtonElement>(null);
    const [showStickerPanel, setShowStickerPanel] = useState(false);
    const stickerButtonRef = useRef<HTMLButtonElement>(null);

    const { isRecording, recordingTime, startRecording, stopRecording, cancelRecording } = useVoiceRecorder({
        onRecorded: (url) => handleMediaUploadSuccess(url, 'audio'),
        onUploadError: () => addToast({ type: 'error', message: 'No se pudo enviar la nota de voz' }),
    });

    const currentDraft = selected ? (drafts[selected.Number] || '') : '';

    const handleInputChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
        // El textarea solo se renderiza cuando `selected` no es null (guard
        // más abajo, `if (!selected) return null;`), pero TS no lo sabe en
        // este closure — invariante explícita, no cambia el comportamiento.
        if (!selected) return;
        const val = e.target.value;
        setDrafts(prev => ({ ...prev, [selected.Number]: val }));
        if (isConnected && selected) {
            sendTypingIndicator(selected.Number);
        }
    };

    const handleSend = () => {
        messagingHandleSend(currentDraft);
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

    if (!selected) return null;

    return (
        <div className="flex-shrink-0 bg-slate-900/80 backdrop-blur-xl border-t border-white/[0.06]">
            {replyingTo && (
                <div className="px-4 py-2 bg-slate-800/50 border-b border-white/5 flex items-center gap-3">
                    <div className="w-1 h-8 bg-indigo-500 rounded-full"></div>
                    <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-indigo-400">
                            Respondiendo a {replySenderLabel(replyingTo, profile?.Telephon, selected)}
                        </div>
                        <div className="text-xs text-slate-400 truncate">{previewMessage(replyingTo)}</div>
                    </div>
                    <button onClick={cancelReply} className="p-1.5 text-slate-400 hover:text-slate-200">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                    </button>
                </div>
            )}
            
            <div className="px-3 py-2.5 sm:px-4 sm:py-3 flex gap-2 items-end relative">
                <div className="relative">
                    <button
                        ref={attachButtonRef}
                        onClick={() => setShowAttachMenu(!showAttachMenu)}
                        className="h-[44px] w-[44px] flex items-center justify-center rounded-full text-slate-400 hover:text-slate-200 hover:bg-white/[0.06] transition-all"
                        aria-label="Adjuntar archivo"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 transform -rotate-45">
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

                <div className="relative">
                    <button
                        ref={stickerButtonRef}
                        onClick={() => setShowStickerPanel(!showStickerPanel)}
                        className="h-[44px] w-[44px] flex items-center justify-center rounded-full text-slate-400 hover:text-slate-200 hover:bg-white/[0.06] transition-all"
                        aria-label="Stickers"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
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

                <div className="flex-1 relative bg-slate-800/80 rounded-2xl flex items-end border border-white/[0.04] focus-within:border-indigo-500/40 transition-colors">
                    {isRecording ? (
                        <div className="w-full h-[44px] flex items-center justify-between px-4 text-red-400">
                            <div className="flex items-center gap-3">
                                <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></div>
                                <span className="font-mono text-sm">{formatRecordingTime(recordingTime)}</span>
                            </div>
                            <button onClick={cancelRecording} className="text-red-400 hover:text-red-300 text-sm font-medium">Cancelar</button>
                        </div>
                    ) : (
                        <textarea 
                            value={currentDraft}
                            onChange={handleInputChange}
                            placeholder="Escribe un mensaje..."
                            className="w-full p-3 px-4 bg-transparent focus:outline-none text-slate-100 placeholder-slate-500 text-[15px] resize-none min-h-[44px] max-h-[120px] transition-all"
                            rows={1}
                            onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    if (selected && currentDraft.trim()) handleSend();
                                }
                            }}
                        />
                    )}
                </div>
                
                {currentDraft.trim() ? (
                    <button
                        className="h-[44px] w-[44px] flex-shrink-0 flex items-center justify-center rounded-full bg-indigo-500 hover:bg-indigo-400 text-slate-950 shadow-lg shadow-indigo-500/25 transition-all active:scale-95"
                        aria-label="Enviar mensaje"
                        onClick={handleSend}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 ml-1">
                            <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
                        </svg>
                    </button>
                ) : (
                    <button
                        className={`h-[44px] w-[44px] flex-shrink-0 flex items-center justify-center rounded-full transition-all active:scale-95 ${isRecording ? 'bg-rose-500 text-white animate-pulse' : 'bg-indigo-500 hover:bg-indigo-400 text-slate-950 shadow-lg shadow-indigo-500/25'}`}
                        aria-label={isRecording ? 'Detener y enviar nota de voz' : 'Grabar nota de voz'}
                        onClick={isRecording ? stopRecording : startRecording}
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

export default MessageInput;
