import { useState, useRef, useEffect } from 'react';
import api from '../api/axios';
import type { MediaUploadResult } from '../types/api';

export interface UseVoiceRecorderOptions {
    /** Se llama con la URL del audio ya subido. */
    onRecorded: (url: string) => void;
    /** Se llama cuando la subida de la nota de voz falla. */
    onUploadError: () => void;
}

export interface VoiceRecorder {
    isRecording: boolean;
    recordingTime: number;
    startRecording: () => Promise<void>;
    stopRecording: () => void;
    cancelRecording: () => void;
}

export const formatRecordingTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Graba una nota de voz con MediaRecorder, la sube a `/api/v1/upload` y
 * notifica la URL resultante. Compartido por el chat 1:1 y el de grupos.
 */
export function useVoiceRecorder({ onRecorded, onUploadError }: UseVoiceRecorderOptions): VoiceRecorder {
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const activeRef = useRef(false);
    const audioChunksRef = useRef<Blob[]>([]);
    const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (e: BlobEvent) => {
                if (e.data.size > 0) audioChunksRef.current.push(e.data);
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                const formData = new FormData();
                formData.append('file', audioBlob, 'voice_note.webm');
                try {
                    // El cuerpo puede llegar vacío/null; guard `response.data &&`
                    // restaura la tolerancia de la versión JS.
                    const response = await api.post<MediaUploadResult | null>('/api/v1/upload', formData, {
                        headers: { 'Content-Type': 'multipart/form-data' }
                    });
                    if (response.data && response.data.url) {
                        onRecorded(response.data.url);
                    }
                } catch (error) {
                    console.error('Error uploading voice note:', error);
                    onUploadError();
                }
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            activeRef.current = true;
            setIsRecording(true);
            setRecordingTime(0);
            recordingTimerRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
        } catch (err) {
            console.error('Error accessing microphone:', err);
            alert('No se pudo acceder al micrófono.');
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            activeRef.current = false;
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            clearInterval(recordingTimerRef.current || undefined);
        }
    };

    const cancelRecording = () => {
        const recorder = mediaRecorderRef.current;
        if (recorder && isRecording) {
            recorder.onstop = () => {
                recorder.stream.getTracks().forEach(track => track.stop());
            };
            activeRef.current = false;
            recorder.stop();
            setIsRecording(false);
            clearInterval(recordingTimerRef.current || undefined);
            setRecordingTime(0);
        }
    };

    // Al desmontar con una grabación activa: cancelar sin subir y soltar el micrófono.
    useEffect(() => () => {
        const recorder = mediaRecorderRef.current;
        if (recorder && activeRef.current) {
            activeRef.current = false;
            clearInterval(recordingTimerRef.current || undefined);
            recorder.onstop = () => { recorder.stream.getTracks().forEach(track => track.stop()); };
            recorder.stop();
        }
    }, []);

    return { isRecording, recordingTime, startRecording, stopRecording, cancelRecording };
}
