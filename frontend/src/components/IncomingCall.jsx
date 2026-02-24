import React, { useEffect, useState } from 'react';

/**
 * IncomingCall Component
 * Modal que aparece cuando recibes una llamada.
 * 
 * Props:
 *  - callerName: string - Nombre del que llama
 *  - callerNumber: string - Teléfono del que llama
 *  - callType: "video" | "audio"
 *  - onAccept: () => void
 *  - onReject: () => void
 */
export default function IncomingCall({ callerName, callerNumber, callType = 'video', onAccept, onReject }) {
    const [elapsed, setElapsed] = useState(0);

    // Auto-rechazar después de 30 segundos
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
        <div className="fixed inset-0 z-[9998] bg-black/70 backdrop-blur-sm flex items-center justify-center">
            <div className="bg-gradient-to-b from-gray-900 to-gray-800 rounded-3xl p-8 w-80 text-center shadow-2xl border border-white/10">
                {/* Animación de llamada */}
                <div className="relative mx-auto w-24 h-24 mb-6">
                    <div className="absolute inset-0 bg-green-500/20 rounded-full animate-ping"></div>
                    <div className="absolute inset-2 bg-green-500/30 rounded-full animate-ping" style={{ animationDelay: '0.2s' }}></div>
                    <div className="relative w-24 h-24 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-full flex items-center justify-center text-white text-3xl font-bold">
                        {(callerName || callerNumber)?.charAt(0)?.toUpperCase()}
                    </div>
                </div>

                {/* Info del que llama */}
                <h3 className="text-white text-xl font-bold mb-1">
                    {callerName || callerNumber}
                </h3>
                <p className="text-indigo-300 text-sm mb-1">
                    {callerNumber}
                </p>
                <p className="text-indigo-400 text-xs mb-8">
                    {callType === 'video' ? '📹 Videollamada entrante...' : '📞 Llamada de voz entrante...'}
                </p>

                {/* Temporizador */}
                <p className="text-indigo-500 text-xs mb-6">
                    Se rechazará en {30 - elapsed}s
                </p>

                {/* Botones */}
                <div className="flex justify-center gap-8">
                    {/* Rechazar */}
                    <button
                        onClick={onReject}
                        className="w-16 h-16 bg-red-600 hover:bg-red-700 rounded-full flex items-center justify-center transition-colors shadow-lg shadow-red-600/30"
                        title="Rechazar"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white rotate-[135deg]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                    </button>

                    {/* Aceptar */}
                    <button
                        onClick={onAccept}
                        className="w-16 h-16 bg-green-600 hover:bg-green-700 rounded-full flex items-center justify-center transition-colors shadow-lg shadow-green-600/30"
                        title="Aceptar"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    );
}
