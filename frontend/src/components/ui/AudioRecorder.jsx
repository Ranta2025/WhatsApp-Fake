import { useState, useRef, useCallback } from 'react';
import api from '../../api/axios';

/**
 * Hook + componente visual para grabar notas de voz.
 * Props:
 *   onSuccess: (url: string) => void
 *   onError?: (msg: string) => void
 *   className?: string
 */
export function useAudioRecorder({ onSuccess, onError }) {
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const timerRef = useRef(null);

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const startRecording = useCallback(async () => {
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
                    if (response.data?.url) {
                        onSuccess?.(response.data.url);
                    } else {
                        onError?.('No se obtuvo URL del audio');
                    }
                } catch (error) {
                    console.error('Error uploading voice note:', error);
                    onError?.('No pudimos enviar la nota de voz. Inténtalo nuevamente.');
                }
                stream.getTracks().forEach((track) => track.stop());
            };

            mediaRecorder.start();
            setIsRecording(true);
            setRecordingTime(0);
            timerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);
        } catch (err) {
            console.error('Error accessing microphone:', err);
            onError?.('No pudimos acceder al micrófono. Revisa los permisos de tu navegador.');
        }
    }, [onSuccess, onError]);

    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            clearInterval(timerRef.current);
            setRecordingTime(0);
        }
    }, [isRecording]);

    const cancelRecording = useCallback(() => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.onstop = () => {
                mediaRecorderRef.current?.stream?.getTracks().forEach((t) => t.stop());
            };
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            clearInterval(timerRef.current);
            setRecordingTime(0);
        }
    }, [isRecording]);

    return {
        isRecording,
        recordingTime,
        formattedTime: formatTime(recordingTime),
        startRecording,
        stopRecording,
        cancelRecording,
    };
}

export default function AudioRecorder({ onSuccess, onError, className = '' }) {
    const { isRecording, formattedTime, startRecording, stopRecording, cancelRecording } = useAudioRecorder({
        onSuccess,
        onError,
    });

    if (!isRecording) {
        return (
            <button
                onClick={startRecording}
                className={`p-2.5 rounded-2xl text-white shadow-lg transition-all hover:scale-[1.03] bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-950/30 hover:from-emerald-400 hover:to-teal-500 ${className}`}
                aria-label="Grabar audio"
                title="Grabar audio"
            >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                    <path d="M8.25 4.5a3.75 3.75 0 117.5 0v8.25a3.75 3.75 0 11-7.5 0V4.5z" />
                    <path d="M6 10.5a.75.75 0 01.75.75v1.5a5.25 5.25 0 1010.5 0v-1.5a.75.75 0 011.5 0v1.5a6.751 6.751 0 01-6 6.709v2.291h3a.75.75 0 010 1.5h-7.5a.75.75 0 010-1.5h3v-2.291a6.751 6.751 0 01-6-6.709v-1.5A.75.75 0 016 10.5z" />
                </svg>
            </button>
        );
    }

    return (
        <div className={`flex items-center gap-3 px-4 h-[46px] rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 ${className}`}>
            <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            <span className="font-mono text-sm">{formattedTime}</span>
            <button onClick={cancelRecording} className="text-red-400 hover:text-red-300 text-sm font-medium ml-2">
                Cancelar
            </button>
            <button
                onClick={stopRecording}
                className="ml-auto p-2 rounded-xl bg-red-500 hover:bg-red-400 text-white transition-colors"
                aria-label="Detener grabación"
            >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                    <path fillRule="evenodd" d="M4.5 7.5a3 3 0 013-3h9a3 3 0 013 3v9a3 3 0 01-3 3h-9a3 3 0 01-3-3v-9z" clipRule="evenodd" />
                </svg>
            </button>
        </div>
    );
}
