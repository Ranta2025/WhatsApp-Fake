import type { JSX } from 'react';

export interface FullScreenLoaderProps {
    label?: string;
}

/** Pantalla de carga a pantalla completa con el logo de la app */
export default function FullScreenLoader({ label = 'Cargando…' }: FullScreenLoaderProps): JSX.Element {
    return (
        <div className="h-full min-h-screen flex flex-col items-center justify-center gap-6 bg-slate-950 hero-surface" role="status" aria-live="polite">
            <div className="relative">
                <div className="absolute inset-0 rounded-3xl bg-indigo-500/30 blur-2xl animate-pulse" />
                <img src="/todos.svg" alt="" className="relative w-16 h-16 rounded-2xl" />
            </div>
            <div className="w-40 h-1 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full animate-loading-bar" />
            </div>
            <p className="text-sm text-slate-400">{label}</p>
        </div>
    );
}
