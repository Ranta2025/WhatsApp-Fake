import React, { useEffect, useState, useRef } from 'react';

/**
 * IncomingCall Component
 * Interfaz profesional para recibir llamadas entrantes.
 * Reproduce un sonido de timbre durante la llamada entrante.
 * 
 * @param {Object} props
 * @param {string} props.callerName - Nombre del que llama
 * @param {string} props.callerNumber - Teléfono del que llama
 * @param {string} props.callType - "video" | "audio"
 * @param {string} [props.groupName] - Nombre del grupo (para llamadas grupales)
 * @param {Function} props.onAccept - Callback al aceptar
 * @param {Function} props.onReject - Callback al rechazar
 */
export default function IncomingCall({ callerName, callerNumber, callType = 'video', groupName, onAccept, onReject }) {
    const [elapsed, setElapsed] = useState(0);
    const audioCtxRef = useRef(null);
    const ringIntervalRef = useRef(null);

    // Reproducir sonido de timbre de llamada entrante
    useEffect(() => {
        let audioCtx;
        let intervalId;

        const playRingtone = () => {
            try {
                if (!audioCtx || audioCtx.state === 'closed') {
                    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                    audioCtxRef.current = audioCtx;
                }

                // Tono dual: simula timbre de teléfono (480Hz + 620Hz)
                const playTone = (freq, startTime, duration) => {
                    const osc = audioCtx.createOscillator();
                    const gain = audioCtx.createGain();
                    osc.type = 'sine';
                    osc.frequency.value = freq;
                    gain.gain.setValueAtTime(0, startTime);
                    gain.gain.linearRampToValueAtTime(0.12, startTime + 0.02);
                    gain.gain.setValueAtTime(0.12, startTime + duration - 0.02);
                    gain.gain.linearRampToValueAtTime(0, startTime + duration);
                    osc.connect(gain);
                    gain.connect(audioCtx.destination);
                    osc.start(startTime);
                    osc.stop(startTime + duration);
                };

                const now = audioCtx.currentTime;
                // Ring pattern: two short bursts
                playTone(480, now, 0.4);
                playTone(620, now, 0.4);
                playTone(480, now + 0.5, 0.4);
                playTone(620, now + 0.5, 0.4);
            } catch (e) {
                console.warn('[IncomingCall] Ring audio error:', e);
            }
        };

        // Reproducir inmediatamente y cada 2 segundos
        playRingtone();
        intervalId = setInterval(playRingtone, 2000);
        ringIntervalRef.current = intervalId;

        return () => {
            if (intervalId) clearInterval(intervalId);
            if (audioCtx) {
                try { audioCtx.close(); } catch (e) { /* ignore */ }
            }
        };
    }, []);

    // Timeout de seguridad de 30 segundos
    useEffect(() => {
        const timer = setInterval(() => {
            setElapsed(prev => {
                if (prev >= 30) {
                    onReject();
                    return prev;
                }
                return prev + 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [onReject]);

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur-xl">
            <div className="w-full max-w-sm animate-in rounded-[2.5rem] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(15,23,42,0.94))] p-8 text-center shadow-[0_36px_140px_-50px_rgba(15,23,42,0.95)] fade-in zoom-in duration-300">
                <div className="mb-5 inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-300">
                    {groupName ? 'Llamada grupal' : 'Llamada entrante'}
                </div>
                <div className="relative mx-auto w-32 h-32 mb-8">
                    <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping duration-1000"></div>
                    <div className="absolute inset-4 rounded-full bg-sky-500/25 animate-ping duration-1000 delay-300"></div>
                    <div className="relative flex h-32 w-32 items-center justify-center rounded-full bg-[linear-gradient(135deg,rgba(14,165,233,0.85),rgba(16,185,129,0.72))] text-4xl font-bold text-white shadow-2xl">
                        {groupName ? groupName.charAt(0).toUpperCase() : (callerName || callerNumber)?.charAt(0)?.toUpperCase()}
                    </div>
                    <div className="absolute -bottom-1 -right-1 rounded-full border-4 border-slate-900 bg-slate-800 p-2.5 shadow-lg">
                        {callType === 'video' ? (
                            <svg className="w-6 h-6 text-sky-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                        ) : (
                            <svg className="w-6 h-6 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                            </svg>
                        )}
                    </div>
                </div>

                <div className="space-y-2 mb-10">
                    <h3 className="text-white text-3xl font-bold tracking-tight">
                        {groupName || callerName || 'Desconocido'}
                    </h3>
                    {groupName ? (
                        <p className="font-medium tracking-wider text-slate-300">
                            {callerName || callerNumber} te está llamando
                        </p>
                    ) : (
                        <p className="font-medium tracking-wider text-slate-300">
                            {callerNumber}
                        </p>
                    )}
                    <div className="inline-flex animate-pulse items-center gap-2 rounded-full bg-white/[0.05] px-4 py-1.5 text-sm font-semibold text-slate-200">
                        {groupName
                            ? (callType === 'video' ? 'VIDEOLLAMADA GRUPAL' : 'LLAMADA GRUPAL')
                            : (callType === 'video' ? 'VIDEOLLAMADA ENTRANTE' : 'LLAMADA DE VOZ ENTRANTE')
                        }
                    </div>
                </div>

                <div className="flex justify-center gap-10">
                    <div className="flex flex-col gap-3 items-center">
                        <button
                            onClick={() => {
                                if (ringIntervalRef.current) clearInterval(ringIntervalRef.current);
                                if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch(e) {} }
                                onReject();
                            }}
                            className="group flex h-20 w-20 items-center justify-center rounded-full bg-rose-500 transition-all shadow-xl shadow-rose-500/20 hover:bg-rose-600 active:scale-90"
                            aria-label="Rechazar llamada"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white rotate-[135deg] group-hover:rotate-[145deg] transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                            </svg>
                        </button>
                        <span className="text-slate-400 text-xs font-bold uppercase tracking-widest">Rechazar</span>
                    </div>

                    <div className="flex flex-col gap-3 items-center">
                        <button
                            onClick={() => {
                                if (ringIntervalRef.current) clearInterval(ringIntervalRef.current);
                                if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch(e) {} }
                                onAccept();
                            }}
                            className="group flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500 transition-all shadow-xl shadow-emerald-500/20 hover:bg-emerald-600 active:scale-90"
                            aria-label="Aceptar llamada"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                            </svg>
                        </button>
                        <span className="text-slate-400 text-xs font-bold uppercase tracking-widest">Aceptar</span>
                    </div>
                </div>

                <div className="mt-10 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    Se rechazará automáticamente en {30 - elapsed}s
                </div>
            </div>
        </div>
    );
}
