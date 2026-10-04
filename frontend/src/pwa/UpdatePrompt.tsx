import { useSyncExternalStore } from 'react';
import { applyUpdate, dismissUpdate, getSnapshot, subscribe } from './updateStore';

export default function UpdatePrompt() {
  const { needRefresh } = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-toast flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-slate-900 px-4 py-3 text-sm text-white shadow-2xl w-[400px] max-w-[calc(100vw-2rem)]"
    >
      <span className="flex-1">Nueva versión disponible</span>
      <button
        type="button"
        onClick={dismissUpdate}
        className="rounded-xl px-3 py-1.5 text-slate-400 hover:bg-white/[0.06] hover:text-white transition-colors"
      >
        Más tarde
      </button>
      <button
        type="button"
        onClick={() => {
          applyUpdate().catch((err: unknown) => console.error('Service worker update failed:', err));
        }}
        className="rounded-xl bg-indigo-600 px-3 py-1.5 font-semibold text-white hover:bg-indigo-500 transition-colors"
      >
        Actualizar
      </button>
    </div>
  );
}
