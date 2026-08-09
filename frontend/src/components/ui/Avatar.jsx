import React from 'react';

/**
 * Avatar circular reutilizable.
 * Props:
 *   src?: string | null
 *   name?: string (usado para fallback de inicial)
 *   size?: 'xs'|'sm'|'md'|'lg'|'xl' (default 'md')
 *   online?: boolean
 *   className?: string
 */
const sizeMap = {
    xs: 'w-6 h-6 text-[10px]',
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-16 h-16 text-xl',
    '2xl': 'w-24 h-24 text-3xl',
};

const onlineDotMap = {
    xs: 'w-1.5 h-1.5 border',
    sm: 'w-2 h-2 border',
    md: 'w-2.5 h-2.5 border-2',
    lg: 'w-3 h-3 border-2',
    xl: 'w-3.5 h-3.5 border-2',
    '2xl': 'w-4 h-4 border-2',
};

const Avatar = React.memo(function Avatar({ src, name = '', size = 'md', online = false, className = '' }) {
    const initial = (name || '?').charAt(0).toUpperCase();
    const sizeClass = sizeMap[size] || sizeMap.md;
    const dotClass = onlineDotMap[size] || onlineDotMap.md;

    return (
        <div className={`relative inline-flex flex-shrink-0 ${sizeClass} ${className}`}>
            {src ? (
                <img src={src} alt={name} className="w-full h-full rounded-full object-cover" />
            ) : (
                <div className="w-full h-full rounded-full bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center font-bold text-white shadow-sm">
                    {initial}
                </div>
            )}
            {online && (
                <span className={`absolute bottom-0 right-0 ${dotClass} rounded-full bg-emerald-500 border-slate-900`} />
            )}
        </div>
    );
});

export default Avatar;
