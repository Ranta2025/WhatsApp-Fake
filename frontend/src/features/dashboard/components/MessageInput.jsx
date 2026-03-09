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
                    alert('No pudimos enviar la nota de voz. Inténtalo nuevamente.');
                }
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            setIsRecording(true);
            setRecordingTime(0);
            recordingTimerRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
        } catch (err) {
            console.error('Error accessing microphone:', err);
            alert('No pudimos acceder al micrófono. Revisa los permisos de tu navegador.');
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
        <div className="flex-shrink-0 border-t border-white/5 bg-slate-900/95 backdrop-blur-md">
            {replyingTo && (
                <div className="px-4 py-2.5 bg-slate-950/35 border-b border-white/5 flex items-center gap-3">
                    <div className="w-1 h-9 bg-gradient-to-b from-cyan-400 to-indigo-500 rounded-full"></div>
                    <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300/85">
                            Respondiendo a {replyingTo.SenderTelephon === profile?.Telephon ? 'ti mismo' : replyingTo.SenderUsername || 'mensaje'}
                        </div>
                        <div className="text-xs text-slate-400 truncate mt-0.5">{replyingTo.Message}</div>
                    </div>
                    <button onClick={cancelReply} className="p-1.5 text-slate-500 hover:text-white hover:bg-white/5 rounded-full transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                    </button>
                </div>
            )}
            
            <div className="p-3 sm:p-4 flex gap-2 sm:gap-3 items-end bg-transparent relative">
                <div className="relative">
                    <button
                        onClick={() => setShowAttachMenu(!showAttachMenu)}
                        className="h-[44px] w-[44px] flex items-center justify-center rounded-2xl border border-white/8 bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-700 transition-all shadow-lg shadow-black/10"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 transform -rotate-45">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                        </svg>
                    </button>
                    {showAttachMenu && (
                        <MediaUploadMenu 
                            onUploadSuccess={(url, type) => { handleMediaUploadSuccess(url, type); setShowAttachMenu(false); }}
                            onUploadError={(err) => { alert(err || 'No pudimos adjuntar tu archivo. Inténtalo nuevamente.'); setShowAttachMenu(false); }}
                            onClose={() => setShowAttachMenu(false)}
                        />
                    )}
                </div>

                <div className="flex-1 relative rounded-[26px] flex items-end border border-white/8 bg-slate-800/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] focus-within:border-cyan-500/40 focus-within:ring-2 focus-within:ring-cyan-500/10 transition-all overflow-hidden">
                    {isRecording ? (
                        <div className="w-full h-[46px] flex items-center justify-between px-4 text-red-400">
                            <div className="flex items-center gap-3">
                                <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></div>
                                <span className="font-mono text-sm">{formatRecordingTime(recordingTime)}</span>
                            </div>
                            <button onClick={cancelRecording} className="text-red-400 hover:text-red-300 text-sm font-medium">Cancelar</button>
                        </div>
                    ) : (
                        <textarea 
                            ref={textareaRef}
                            value={currentDraft}
                            onChange={handleInputChange}
                            placeholder="Escribe un mensaje..."
                            className="w-full bg-transparent px-4 py-3 focus:outline-none text-slate-100 placeholder-slate-500 text-[15px] resize-none min-h-[46px] max-h-[120px] leading-relaxed transition-all"
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
                        className="h-[46px] w-[46px] flex items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-lg shadow-sky-900/30 transition-all hover:scale-[1.03] hover:from-sky-400 hover:to-indigo-500"
                        onClick={handleSend}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 ml-1">
                            <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
                        </svg>
                    </button>
                ) : (
                    <button
                        className={`h-[46px] w-[46px] flex items-center justify-center rounded-2xl text-white shadow-lg transition-all hover:scale-[1.03] ${isRecording ? 'bg-red-500 shadow-red-950/30' : 'bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-950/30 hover:from-emerald-400 hover:to-teal-500'}`}
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
