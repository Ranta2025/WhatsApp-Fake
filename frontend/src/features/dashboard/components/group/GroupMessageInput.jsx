import React, { useState, useRef, useEffect } from 'react';
import { useDashboard } from '../../context/DashboardContext';
import { useGroupMessaging } from '../../hooks/useGroupMessaging';
import MediaUploadMenu from '../../../../components/MediaUploadMenu';
import api from '../../../../api/axios';

const GroupMessageInput = React.memo(function GroupMessageInput() {
    const [text, setText]                     = useState('');
    const [showAttachMenu, setShowAttachMenu] = useState(false);
    const [isRecording, setIsRecording]       = useState(false);
    const [recordingTime, setRecordingTime]   = useState(0);
    const inputRef          = useRef(null);
    const mediaRecorderRef  = useRef(null);
    const audioChunksRef    = useRef([]);
    const recordingTimerRef = useRef(null);

    useEffect(() => {
        return () => {
            if (recordingTimerRef.current) {
                clearInterval(recordingTimerRef.current);
            }
        };
    }, []);

    const {
        handleSend, handleTyping,
        editingMessageId, editingMessageText, handleEditMessageChange,
        handleEditMessageSave, handleEditMessageCancel,
        replyingTo, cancelReply,
        handleMediaUploadSuccess,
    } = useGroupMessaging();

    const { isConnected, selectedGroup, addToast } = useDashboard();

    if (selectedGroup?.UserRole === 'left') {
        return (
            <div className="flex-shrink-0 border-t border-white/[0.04] bg-[#0B1120]/95 backdrop-blur-md px-4 py-4 flex items-center justify-center gap-2 text-slate-500 text-sm italic">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
                Ya no eres miembro de este grupo
            </div>
        );
    }

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunksRef.current.push(e.data);
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                const formData = new FormData();
                formData.append('file', audioBlob, 'voice_note.webm');
                try {
                    const response = await api.post('/api/v1/upload', formData, {
                        headers: { 'Content-Type': 'multipart/form-data' },
                    });
                    if (response.data && response.data.url) {
                        handleMediaUploadSuccess(response.data.url, 'audio');
                    }
                } catch (error) {
                    console.error('Error uploading voice note:', error);
                    addToast({ type: 'error', message: 'Error al enviar nota de voz' });
                }
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            setIsRecording(true);
            setRecordingTime(0);
            recordingTimerRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
        } catch (err) {
            console.error('Error accessing microphone:', err);
            addToast({ type: 'error', message: 'No se pudo acceder al micrófono.' });
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            clearInterval(recordingTimerRef.current);
            setRecordingTime(0);
        }
    };

    const cancelRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.onstop = () => {
                mediaRecorderRef.current.stream?.getTracks().forEach(t => t.stop());
            };
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            clearInterval(recordingTimerRef.current);
            setRecordingTime(0);
        }
    };

    const formatRecordingTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const onSend = () => {
        if (!text.trim()) return;
        handleSend(text.trim());
        setText('');
    };

    const onKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (editingMessageId) {
                handleEditMessageSave();
            } else {
                onSend();
            }
        }
        if (e.key === 'Escape') {
            if (editingMessageId) handleEditMessageCancel();
            if (replyingTo) cancelReply();
        }
    };

    const inputValue    = editingMessageId ? editingMessageText : text;
    const inputOnChange = editingMessageId
        ? handleEditMessageChange
        : (e) => { setText(e.target.value); handleTyping(); };

    const hasText = editingMessageId ? editingMessageText.trim() : text.trim();

    return (
        <div className="flex-shrink-0 border-t border-white/[0.04] bg-[#0B1120]/95 backdrop-blur-md">
            {/* Reply banner */}
            {replyingTo && !editingMessageId && (
                <div className="flex items-center gap-2 px-4 py-2 bg-indigo-900/30 border-b border-indigo-500/20">
                    <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-indigo-400">
                            Respondiendo a {replyingTo.SenderUsername || replyingTo.SenderTelephon}
                        </div>
                        <div className="text-xs text-slate-400 truncate">{replyingTo.Message}</div>
                    </div>
                    <button onClick={cancelReply} className="text-slate-500 hover:text-white transition-colors">
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
                    <button onClick={handleEditMessageCancel} className="text-slate-500 hover:text-white transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            )}

            {/* Input row */}
            <div className="flex items-end gap-2 px-3 py-3">
                <div className="relative flex-shrink-0">
                    <button
                        onClick={() => setShowAttachMenu(v => !v)}
                        disabled={!isConnected || isRecording}
                        className="p-2.5 text-slate-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        aria-label="Adjuntar archivo"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                        </svg>
                    </button>
                    {showAttachMenu && (
                        <MediaUploadMenu
                            onUploadSuccess={(url, type) => { handleMediaUploadSuccess(url, type); setShowAttachMenu(false); }}
                            onUploadError={(err) => { addToast({ type: 'error', message: err }); setShowAttachMenu(false); }}
                            onClose={() => setShowAttachMenu(false)}
                        />
                    )}
                </div>

                <div className="flex-1 relative bg-slate-800 rounded-2xl border border-white/10 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition-all overflow-hidden">
                    {isRecording ? (
                        <div className="flex items-center justify-between px-4 h-[42px] text-red-400">
                            <div className="flex items-center gap-3">
                                <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                                <span className="font-mono text-sm">{formatRecordingTime(recordingTime)}</span>
                            </div>
                            <button onClick={cancelRecording} className="text-red-400 hover:text-red-300 text-sm font-medium">
                                Cancelar
                            </button>
                        </div>
                    ) : (
                        <textarea
                            ref={inputRef}
                            rows={1}
                            value={inputValue}
                            onChange={inputOnChange}
                            onKeyDown={onKeyDown}
                            disabled={!isConnected}
                            placeholder={isConnected ? 'Escribe un mensaje en el grupo...' : 'Sin conexión...'}
                            className="w-full resize-none bg-transparent px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none text-sm leading-relaxed disabled:opacity-50 max-h-36 overflow-auto"
                            style={{ minHeight: '42px' }}
                            onInput={e => {
                                e.target.style.height = 'auto';
                                e.target.style.height = Math.min(e.target.scrollHeight, 144) + 'px';
                            }}
                        />
                    )}
                </div>

                {hasText || editingMessageId ? (
                    <button
                        onClick={editingMessageId ? handleEditMessageSave : onSend}
                        disabled={!isConnected || !hasText}
                        className="p-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-full transition-all flex-shrink-0 shadow-lg"
                        aria-label={editingMessageId ? 'Confirmar edición' : 'Enviar'}
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
                        className={`p-2.5 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-full transition-all flex-shrink-0 shadow-lg ${isRecording ? 'bg-red-500 hover:bg-red-400' : 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500'}`}
                        aria-label={isRecording ? 'Detener grabación' : 'Grabar audio'}
                    >
                        {isRecording ? (
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                <path fillRule="evenodd" d="M4.5 7.5a3 3 0 013-3h9a3 3 0 013 3v9a3 3 0 01-3 3h-9a3 3 0 01-3-3v-9z" clipRule="evenodd" />
                            </svg>
                        ) : (
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                                <path d="M19 10v2a7 7 0 0 1-14 0v-2a1 1 0 0 0-2 0v2a9 9 0 0 0 8 8.94V21H8a1 1 0 0 0 0 2h8a1 1 0 0 0 0-2h-3v-2.06A9 9 0 0 0 21 12v-2a1 1 0 0 0-2 0z" />
                            </svg>
                        )}
                    </button>
                )}
            </div>
        </div>
    );
});

export default GroupMessageInput;
