import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * Modal base con portal, backdrop blur, animaciones y focus trap simple.
 * Uso: <Modal isOpen={bool} onClose={fn} title="Titulo">{children}</Modal>
 */
export default function Modal({ isOpen, onClose, title, children, maxWidth = 'max-w-md', showClose = true }) {
    const overlayRef = useRef(null);

    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKey);
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = '';
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return createPortal(
        <div
            ref={overlayRef}
            className="fixed inset-0 z-[500] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={(e) => {
                if (e.target === overlayRef.current) onClose();
            }}
            role="dialog"
            aria-modal="true"
        >
            <div className={`w-full ${maxWidth} rounded-3xl border border-white/10 bg-slate-900/95 shadow-2xl backdrop-blur-xl animate-in zoom-in-95 duration-200`}>
                {title && (
                    <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
                        <h3 className="text-lg font-bold text-white">{title}</h3>
                        {showClose && (
                            <button
                                onClick={onClose}
                                className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition-colors"
                                aria-label="Cerrar modal"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                    </div>
                )}
                <div className="px-6 py-5">{children}</div>
            </div>
        </div>,
        document.body
    );
}
