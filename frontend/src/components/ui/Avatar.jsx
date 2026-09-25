// Avatar reutilizable: foto o inicial sobre un degradado estable por nombre,
// con indicador opcional de "en línea".

const GRADIENTS = [
    'from-indigo-500 to-purple-500',
    'from-sky-500 to-indigo-500',
    'from-amber-500 to-rose-500',
    'from-fuchsia-500 to-violet-500',
    'from-purple-500 to-sky-600',
    'from-rose-500 to-orange-400',
    'from-lime-500 to-indigo-600',
];

const SIZES = {
    sm: 'w-9 h-9 text-sm',
    md: 'w-11 h-11 text-base',
    lg: 'w-12 h-12 text-lg',
    xl: 'w-24 h-24 text-3xl',
};

const DOT_SIZES = {
    sm: 'w-2.5 h-2.5',
    md: 'w-3 h-3',
    lg: 'w-3.5 h-3.5',
    xl: 'w-5 h-5',
};

const hash = (text) => {
    let h = 0;
    for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
    return Math.abs(h);
};

export default function Avatar({ src, name = '', size = 'md', online = false, ringClass = 'ring-slate-900', className = '' }) {
    const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
    const gradient = GRADIENTS[hash(name || '?') % GRADIENTS.length];

    return (
        <div className={`relative flex-shrink-0 ${SIZES[size]} ${className}`}>
            {src ? (
                <img src={src} alt={name} className="w-full h-full rounded-full object-cover" loading="lazy" />
            ) : (
                <div className={`w-full h-full rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center font-semibold text-white select-none`}>
                    {initial}
                </div>
            )}
            {online && (
                <span
                    className={`absolute bottom-0 right-0 ${DOT_SIZES[size]} rounded-full bg-indigo-400 ring-2 ${ringClass}`}
                    aria-label="En línea"
                />
            )}
        </div>
    );
}
