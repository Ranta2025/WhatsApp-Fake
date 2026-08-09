import React from 'react';
import AudioPlayer from './AudioPlayer';

/**
 * Renderiza contenido multimedia de forma unificada.
 * Soporta: image, video, audio, document.
 */
const MediaRenderer = React.memo(function MediaRenderer({ type, url, text, isMine = false, className = '' }) {
    if (!type && text) {
        // Fallback: inferir tipo desde URL
        if (text.includes('/audio/')) type = 'audio';
        else if (text.includes('/images/')) type = 'image';
        else if (text.includes('/videos/')) type = 'video';
        else if (text.includes('/docs/')) type = 'document';
    }

    const mediaUrl = url || text;
    if (!type || !mediaUrl) return null;

    switch (type) {
        case 'image':
            return (
                <div className={`mb-2 rounded-2xl overflow-hidden max-w-sm bg-slate-800/50 ${className}`}>
                    <img
                        src={mediaUrl}
                        alt="Imagen adjunta"
                        loading="lazy"
                        className="w-full h-auto object-cover max-h-80 cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => window.open(mediaUrl, '_blank')}
                    />
                </div>
            );
        case 'video':
            return (
                <div className={`mb-2 rounded-2xl overflow-hidden max-w-sm bg-slate-800/50 ${className}`}>
                    <video src={mediaUrl} controls className="w-full max-h-80 bg-black/20" />
                </div>
            );
        case 'audio':
            return (
                <div className={`mb-1 w-full max-w-full min-w-0 ${className}`}>
                    <AudioPlayer src={mediaUrl} isMine={isMine} />
                </div>
            );
        case 'document':
            return (
                <a
                    href={mediaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`mb-2 flex items-center gap-3 p-3 bg-black/20 hover:bg-black/30 rounded-2xl transition-all border border-white/5 group ${className}`}
                >
                    <div className="w-11 h-11 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-white truncate">Documento</div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-indigo-300/60">Clic para descargar</div>
                    </div>
                </a>
            );
        default:
            return null;
    }
});

export default MediaRenderer;
