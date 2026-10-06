import AudioPlayer from './AudioPlayer';
import { resolveMedia, type MediaMessageFields } from '../lib/mediaMessage';
import { findBuiltinSticker } from '../features/stickers/builtinPack';

interface MediaContentProps {
    message: MediaMessageFields;
    isMine: boolean;
}

/**
 * Renderiza el adjunto de un mensaje (imagen, video, audio o documento).
 * Compartido por el chat 1:1 y el de grupos. Devuelve null si no hay media.
 */
export default function MediaContent({ message, isMine }: MediaContentProps) {
    const media = resolveMedia(message);
    if (!media) return null;
    const { mediaType, mediaUrl } = media;

    switch (mediaType) {
        case 'image':
            return (
                <div className="mb-2 rounded-xl overflow-hidden max-w-sm bg-slate-800/50">
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
                <div className="mb-2 rounded-xl overflow-hidden max-w-sm bg-slate-800/50">
                    <video src={mediaUrl} controls className="w-full max-h-80 bg-black/20" />
                </div>
            );
        case 'audio':
            return (
                <div className="mb-1 w-full min-w-[240px]">
                    <AudioPlayer src={mediaUrl} isMine={isMine} />
                </div>
            );
        case 'document':
            return (
                <a href={mediaUrl} target="_blank" rel="noopener noreferrer" className="mb-2 flex items-center gap-3 p-3 bg-quote hover:bg-black/30 rounded-xl transition-all border border-fg/5 group">
                    <div className="w-11 h-11 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className={`text-sm font-bold ${isMine ? 'text-on-accent' : 'text-fg'} truncate`}>Documento</div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-indigo-300/60">Clic para descargar</div>
                    </div>
                </a>
            );
        case 'sticker':
            return (
                <img
                    src={mediaUrl}
                    alt={findBuiltinSticker(mediaUrl)?.alt ?? 'Sticker'}
                    width={150}
                    height={150}
                    loading="lazy"
                    draggable={false}
                    className="block w-[150px] h-[150px] object-contain"
                />
            );
        default:
            return null;
    }
}
