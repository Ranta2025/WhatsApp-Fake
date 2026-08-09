import Modal from './Modal';

/**
 * Dialogo de confirmacion reutilizable.
 * Props:
 *   isOpen, onClose, onConfirm,
 *   title, description,
 *   confirmText?, cancelText?,
 *   variant?: 'danger' | 'warning' | 'info'
 *   loading?: boolean
 */
export default function ConfirmDialog({
    isOpen,
    onClose,
    onConfirm,
    title,
    description,
    confirmText = 'Confirmar',
    cancelText = 'Cancelar',
    variant = 'danger',
    loading = false,
}) {
    const variantStyles = {
        danger: {
            iconBg: 'bg-red-500/15',
            iconColor: 'text-red-400',
            btn: 'bg-red-600 hover:bg-red-500',
        },
        warning: {
            iconBg: 'bg-amber-500/15',
            iconColor: 'text-amber-400',
            btn: 'bg-amber-600 hover:bg-amber-500',
        },
        info: {
            iconBg: 'bg-sky-500/15',
            iconColor: 'text-sky-400',
            btn: 'bg-sky-600 hover:bg-sky-500',
        },
    };

    const v = variantStyles[variant];

    return (
        <Modal isOpen={isOpen} onClose={onClose} maxWidth="max-w-xs" showClose={false}>
            <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full ${v.iconBg} flex items-center justify-center flex-shrink-0`}>
                        <svg className={`w-5 h-5 ${v.iconColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <div>
                        <p className="font-semibold text-white">{title}</p>
                        {description && <p className="text-xs text-slate-400 mt-0.5">{description}</p>}
                    </div>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={onClose}
                        disabled={loading}
                        className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors disabled:opacity-50"
                    >
                        {cancelText}
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={loading}
                        className={`flex-1 py-2.5 rounded-xl ${v.btn} disabled:opacity-50 text-white text-sm font-semibold transition-colors`}
                    >
                        {loading ? 'Procesando...' : confirmText}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
