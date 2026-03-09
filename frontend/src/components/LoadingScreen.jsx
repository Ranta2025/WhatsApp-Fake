import React, { useEffect, useState } from 'react';

const STEPS = [
    { key: 'profile',  label: 'Cargando perfil...' },
    { key: 'contacts', label: 'Cargando contactos...' },
    { key: 'chats',    label: 'Cargando conversaciones...' },
    { key: 'groups',   label: 'Cargando grupos...' },
    { key: 'statuses', label: 'Cargando estados...' },
];

/**
 * LoadingScreen
 * Pantalla de carga moderna que muestra el progreso de inicialización.
 *
 * @param {Object}  props
 * @param {Object}  props.loadingSteps  - { profile: bool, contacts: bool, chats: bool, groups: bool, statuses: bool }
 */
export default function LoadingScreen({ loadingSteps = {} }) {
    const done = Object.values(loadingSteps).filter(Boolean).length;
    const total = STEPS.length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    // Cycle through the "current" step label for animation
    const [displayLabel, setDisplayLabel] = useState(STEPS[0].label);

    useEffect(() => {
        const next = STEPS.find(s => !loadingSteps[s.key]);
        if (next) setDisplayLabel(next.label);
        else setDisplayLabel('¡Listo!');
    }, [loadingSteps]);

    return (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 select-none">
            {/* Background glow */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-indigo-900/20 rounded-full blur-[100px]" />
                <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 w-[400px] h-[400px] bg-purple-900/15 rounded-full blur-[80px]" />
            </div>

            <div className="relative flex flex-col items-center gap-8 px-8 max-w-sm w-full">

                {/* Logo + Pulse ring */}
                <div className="relative">
                    {/* Outer pulse */}
                    <div className="absolute inset-0 rounded-full bg-indigo-500/20 animate-ping" style={{ animationDuration: '2s' }} />
                    {/* Mid ring */}
                    <div className="absolute -inset-3 rounded-full border border-indigo-500/20 animate-ping" style={{ animationDuration: '2.5s', animationDelay: '0.3s' }} />
                    {/* Icon container */}
                    <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-indigo-600 to-purple-700 flex items-center justify-center shadow-2xl shadow-indigo-500/40">
                        {/* Chat bubble icon */}
                        <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M20 2H4a2 2 0 00-2 2v18l4-4h14a2 2 0 002-2V4a2 2 0 00-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
                        </svg>
                    </div>
                </div>

                {/* App name */}
                <div className="text-center">
                    <h1 className="text-4xl font-black text-white tracking-tight leading-none">
                        todos
                    </h1>
                    <p className="text-slate-500 text-sm mt-1 font-medium tracking-wide">Mensajería segura</p>
                </div>

                {/* Step indicators */}
                <div className="w-full flex flex-col gap-2.5">
                    {STEPS.map((step) => {
                        const isDone = !!loadingSteps[step.key];
                        const isActive = !isDone && STEPS.find(s => !loadingSteps[s.key])?.key === step.key;
                        return (
                            <div key={step.key}
                                 className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-300 ${
                                     isDone
                                         ? 'bg-indigo-500/10 border border-indigo-500/20'
                                         : isActive
                                             ? 'bg-white/5 border border-white/10'
                                             : 'bg-white/[0.02] border border-white/5 opacity-40'
                                 }`}>
                                {/* Status icon */}
                                <div className={`w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center transition-all duration-500 ${
                                    isDone
                                        ? 'bg-indigo-500'
                                        : isActive
                                            ? 'bg-slate-600 ring-2 ring-indigo-500/50'
                                            : 'bg-slate-700'
                                }`}>
                                    {isDone ? (
                                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                        </svg>
                                    ) : isActive ? (
                                        <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                                    ) : null}
                                </div>
                                <span className={`text-sm font-medium ${
                                    isDone ? 'text-indigo-300' : isActive ? 'text-slate-300' : 'text-slate-600'
                                }`}>
                                    {step.label.replace('...', '')}
                                </span>
                                {isDone && (
                                    <span className="ml-auto text-xs text-indigo-400/70 font-semibold">✓</span>
                                )}
                                {isActive && (
                                    <span className="ml-auto">
                                        <LoadingDots />
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Progress bar */}
                <div className="w-full">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-xs text-slate-500 font-medium truncate max-w-[200px]">
                            {displayLabel}
                        </span>
                        <span className="text-xs text-indigo-400 font-bold tabular-nums">{pct}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-indigo-600 to-purple-600 rounded-full transition-all duration-500 ease-out"
                            style={{ width: `${pct}%` }}
                        />
                    </div>
                </div>

            </div>

            {/* Footer */}
            <div className="absolute bottom-6 text-center text-slate-700 text-xs font-medium tracking-wide">
                todos © {new Date().getFullYear()}
            </div>
        </div>
    );
}

/** Animated three-dot loader */
function LoadingDots() {
    return (
        <span className="inline-flex gap-0.5 items-end">
            {[0, 1, 2].map(i => (
                <span
                    key={i}
                    className="w-1 h-1 rounded-full bg-indigo-400 inline-block animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s`, animationDuration: '0.8s' }}
                />
            ))}
        </span>
    );
}
