import React, { useState, useRef, useEffect } from 'react';
import { useDashboard } from '../context/DashboardContext';
import { useMessaging } from '../hooks/useMessaging';
import MediaUploadMenu from '../../../components/MediaUploadMenu';
import api from '../../../api/axios';

const MessageInput = () => {
    const { 
        selected, isConnected, profile, drafts, setDrafts, 
        sendTypingIndicator, sendMessage 
    } = useDashboard();
    
    const { 
        replyingTo, cancelReply, handleMediaUploadSuccess, 
        handleSend: messagingHandleSend 
    } = useMessaging();

    const [showAttachMenu, setShowAttachMenu] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const recordingTimerRef = useRef(null);
    const textareaRef = useRef(null);

    useEffect(() => {
        return () => {
            if (recordingTimerRef.current) {
                clearInterval(recordingTimerRef.current);
            }
        };
    }, []);

    const currentDraft = selected ? (drafts[selected.Number] || '') : '';

    const handleInputChange = (e) => {
        const val = e.target.value;
        setDrafts(prev => ({ ...prev, [selected.Number]: val }));
        if (isConnected && selected) {
            sendTypingIndicator(selected.Number);
        }
    };

    const handleSend = () => {
        messagingHandleSend(currentDraft);
    };

    useEffect(() => {
        if (!textareaRef.current) return;
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }, [currentDraft, selected?.Number]);

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
                        headers: { 'Content-Type': 'multipart/form-data' }
                    });
                    if (response.data && response.data.url) {
                        handleMediaUploadSuccess(response.data.url, 'audio');
                    }
                } catch (error) {
                    console.error('Error uploading voice note:', error);
                    alert('No pudimos enviar la nota de voz. Intentalo nuevamente.');
                }
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            setIsRecording(true);
            setRecordingTime(0);
            recordingTimerRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
        } catch (err) {
            console.error('Error accessing microphone:', err);
            alert('No pudimos acceder al microfono. Revisa los permisos de tu navegador.');
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            clearInterval(recordingTimerRef.current);
        }
    };

    const cancelRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.onstop = () => {
                mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
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

    if (!selected) return null;

    return (
        <div className="flex-shrink-0 bg-[#0B1120]/95 backdrop-blur-md border-t border-white/[0.04]">
            {replyingTo && (
                <div className="px-4 py-2 bg-white/[0.02] border-b border-white/[0.04] flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-medium uppercase tracking-wider text-sky-400/70">
                            Respondiendo a {replyingTo.SenderTelephon === profile?.Telephon ? 'ti' : replyingTo.SenderUsername || 'mensaje'}
                        </div>
                        <div className="text-xs text-slate-500 truncate mt-0.5">{replyingTo.Message}</div>
                    </div>
                    <button onClick={cancelReply} className="p-1.5 text-slate-500 hover:text-white hover:bg-white/[0.04] rounded-full transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                    </button>
                </div>
            )}
            
            <div className="p-3 sm:p-4 flex gap-2 sm:gap-3 items-end relative">
                <div className="relative">
                    <button
                        onClick={() => setShowAttachMenu(!showAttachMenu)}
                        className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/[0.03] border border-white/[0.06] text-slate-400 hover:text-white hover:bg-white/[0.06] transition-all"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 transform -rotate-45">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                        </svg>
                    </button>
                    {showAttachMenu && (
                        <MediaUploadMenu 
                            onUploadSuccess={(url, type) => { handleMediaUploadSuccess(url, type); setShowAttachMenu(false); }}
                            onUploadError={(err) => { alert(err || 'No pudimos adjuntar tu archivo.'); setShowAttachMenu(false); }}
                            onClose={() => setShowAttachMenu(false)}
                        />
                    )}
                </div>

                <div className="flex-1 relative rounded-xl flex items-end border border-white/[0.06] bg-white/[0.02] focus-within:border-sky-500/20 focus-within:ring-1 focus-within:ring-sky-500/10 transition-all overflow-hidden">
                    {isRecording ? (
                        <div className="w-full h-10 flex items-center justify-between px-4 text-red-400 rounded-xl bg-red-500/5 border border-red-500/10">
                            <div className="flex items-center gap-3">
                                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                                <span className="font-mono text-sm">{formatRecordingTime(recordingTime)}</span>
                            </div>
                            <button onClick={cancelRecording} className="text-red-400 hover:text-red-300 text-xs font-medium transition-colors">Cancelar</button>
                        </div>
                    ) : (
                        <textarea 
                            ref={textareaRef}
                            value={currentDraft}
                            onChange={handleInputChange}
                            placeholder="Escribe un mensaje..."
                            className="w-full bg-transparent px-4 py-3 focus:outline-none text-slate-200 placeholder-slate-600 text-[15px] resize-none min-h-[44px] max-h-[120px] leading-relaxed"
                            rows={1}
                            onInput={(e) => {
                                e.target.style.height = 'auto';
                                e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                            }}
                            onKeyDown={(e) => {
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
                        className="w-10 h-10 flex items-center justify-center rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-lg shadow-sky-500/10 hover:shadow-sky-500/20 hover:brightness-105 transition-all active:scale-95"
                        onClick={handleSend}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 ml-0.5">
                            <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
                        </svg>
                    </button>
                ) : (
                    <button
                        className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all ${isRecording ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' : 'bg-white/[0.03] text-emerald-400 hover:bg-white/[0.06] border border-white/[0.06]'}`}
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
