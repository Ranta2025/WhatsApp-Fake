import React, { useState } from 'react';
import { requestAllPermissions } from '../utils/permissions';

/**
 * Modal que solicita todos los permisos del navegador de una sola vez.
 * Se muestra cuando hay permisos en estado 'prompt' (aún no decididos).
 * @param {function} onDone - Callback cuando el usuario termina (aceptó o saltó)
 */
export default function PermissionsDialog({ onDone }) {
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState(null);

    const handleAllow = async () => {
        setLoading(true);
        const res = await requestAllPermissions();
        setResults(res);
        setLoading(false);
    };

    const allDone = results !== null;

    const icon = (status) => {
        if (status === 'granted') return (
            <span className="text-green-400">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
            </span>
        );
        if (status === 'denied') return (
            <span className="text-red-400">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
            </span>
        );
        return (
            <span className="text-gray-500">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <circle cx="12" cy="12" r="9" />
                </svg>
            </span>
        );
    };

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="bg-gray-900 border border-white/10 rounded-3xl shadow-2xl w-full max-w-sm mx-4 p-7 flex flex-col items-center text-center">

                {/* Icono animado */}
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mb-5 shadow-lg shadow-indigo-500/30">
                    <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                    </svg>
                </div>

                <h2 className="text-xl font-bold text-white mb-2">Permisos necesarios</h2>
                <p className="text-gray-400 text-sm mb-6 leading-relaxed">
                    Para usar llamadas, notas de voz y notificaciones, necesitamos acceso a tu cámara, micrófono y notificaciones del sistema.
                </p>

                {/* Lista de permisos */}
                <div className="w-full space-y-3 mb-6">
                    {[
                        { key: 'notifications', label: 'Notificaciones', desc: 'Mensajes nuevos', icon: '🔔' },
                        { key: 'microphone',    label: 'Micrófono',      desc: 'Notas de voz y llamadas', icon: '🎙️' },
                        { key: 'camera',        label: 'Cámara',         desc: 'Videollamadas', icon: '📷' },
                    ].map(({ key, label, desc, icon: emoji }) => (
                        <div key={key} className="flex items-center gap-3 bg-white/5 rounded-xl px-4 py-3 text-left">
                            <span className="text-2xl">{emoji}</span>
                            <div className="flex-1">
                                <div className="text-sm font-semibold text-white">{label}</div>
                                <div className="text-xs text-gray-500">{desc}</div>
                            </div>
                            {results ? icon(results[key]) : (
                                <span className="w-2 h-2 rounded-full bg-yellow-400/70" />
                            )}
                        </div>
                    ))}
                </div>

                {/* Botones */}
                {!allDone ? (
                    <button
                        onClick={handleAllow}
                        disabled={loading}
                        className="w-full py-3 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold text-sm shadow-lg hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-wait"
                    >
                        {loading ? (
                            <span className="flex items-center justify-center gap-2">
                                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                                </svg>
                                Solicitando permisos...
                            </span>
                        ) : 'Dar permisos'}
                    </button>
                ) : (
                    <button
                        onClick={onDone}
                        className="w-full py-3 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold text-sm shadow-lg hover:opacity-90 active:scale-95 transition-all"
                    >
                        Continuar
                    </button>
                )}

                <button
                    onClick={onDone}
                    className="mt-3 text-xs text-gray-600 hover:text-gray-400 transition-colors"
                >
                    {allDone ? '' : 'Saltar por ahora'}
                </button>
            </div>
        </div>
    );
}
