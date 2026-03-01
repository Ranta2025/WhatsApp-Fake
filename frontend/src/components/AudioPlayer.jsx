import React, { useRef, useState, useEffect, useCallback } from 'react';

/**
 * AudioPlayer Component
 * Reproductor de audio con feedback visual y controles de velocidad.
 */
export default function AudioPlayer({ src, isMine = false }) {
    const audioRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [isLoaded, setIsLoaded] = useState(false);
    const [playbackRate, setPlaybackRate] = useState(1);
    const progressRef = useRef(null);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const onLoadedMetadata = () => {
            setDuration(audio.duration);
            setIsLoaded(true);
        };
        const onTimeUpdate = () => setCurrentTime(audio.currentTime);
        const onEnded = () => {
            setIsPlaying(false);
            setCurrentTime(0);
        };
        const onError = () => {
            console.error('Error loading audio:', src);
        };

        audio.addEventListener('loadedmetadata', onLoadedMetadata);
        audio.addEventListener('timeupdate', onTimeUpdate);
        audio.addEventListener('ended', onEnded);
        audio.addEventListener('error', onError);

        if (audio.readyState >= 1) {
            setDuration(audio.duration);
            setIsLoaded(true);
        }

        return () => {
            audio.removeEventListener('loadedmetadata', onLoadedMetadata);
            audio.removeEventListener('timeupdate', onTimeUpdate);
            audio.removeEventListener('ended', onEnded);
            audio.removeEventListener('error', onError);
        };
    }, [src]);

    const togglePlay = useCallback(() => {
        const audio = audioRef.current;
        if (!audio) return;
        if (isPlaying) {
            audio.pause();
            setIsPlaying(false);
        } else {
            audio.play().catch(() => {});
            setIsPlaying(true);
        }
    }, [isPlaying]);

    const handleSeek = useCallback((e) => {
        const audio = audioRef.current;
        const bar = progressRef.current;
        if (!audio || !bar || !duration) return;

        const rect = bar.getBoundingClientRect();
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clickX = clientX - rect.left;
        const pct = Math.max(0, Math.min(1, clickX / rect.width));
        audio.currentTime = pct * duration;
        setCurrentTime(audio.currentTime);
    }, [duration]);

    const speeds = [1, 1.5, 2, 0.5];
    const cycleSpeed = useCallback(() => {
        const audio = audioRef.current;
        if (!audio) return;
        const idx = speeds.indexOf(playbackRate);
        const next = speeds[(idx + 1) % speeds.length];
        audio.playbackRate = next;
        setPlaybackRate(next);
    }, [playbackRate]);

    const formatTime = (t) => {
        if (!t || isNaN(t) || !isFinite(t)) return '0:00';
        const m = Math.floor(t / 60);
        const s = Math.floor(t % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

    // Colores basados en el diseño senior
    const accentColor = isMine ? 'bg-white' : 'bg-indigo-400';
    const textColor = isMine ? 'text-indigo-100/80' : 'text-slate-400';
    const btnBg = isMine ? 'bg-white/20 hover:bg-white/30' : 'bg-indigo-500/20 hover:bg-indigo-500/30';
    const iconColor = isMine ? 'text-white' : 'text-indigo-400';

    return (
        <div className="flex items-center gap-3 py-1 min-w-[240px]">
            <audio ref={audioRef} src={src} preload="metadata" />
            
            {/* Botón Play/Pause */}
            <button 
                onClick={togglePlay}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-90 ${btnBg}`}
                aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
            >
                {isPlaying ? (
                    <svg className={`w-5 h-5 ${iconColor}`} fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                    </svg>
                ) : (
                    <svg className={`w-5 h-5 ml-0.5 ${iconColor}`} fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7L8 5z" />
                    </svg>
                )}
            </button>

            {/* Visualizador y Progreso */}
            <div className="flex-1 space-y-1.5">
                <div 
                    ref={progressRef}
                    onClick={handleSeek}
                    className="relative h-1.5 bg-black/20 rounded-full cursor-pointer group"
                >
                    <div 
                        className={`absolute top-0 left-0 h-full rounded-full transition-all duration-100 ${accentColor}`}
                        style={{ width: `${progress}%` }}
                    />
                    {/* Handle del progreso */}
                    <div 
                        className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity ${accentColor}`}
                        style={{ left: `${progress}%`, marginLeft: '-6px' }}
                    />
                </div>
                
                <div className="flex justify-between items-center">
                    <span className={`text-[10px] font-black tracking-widest uppercase ${textColor}`}>
                        {formatTime(currentTime)} / {formatTime(duration)}
                    </span>
                    
                    {/* Selector de velocidad */}
                    <button 
                        onClick={cycleSpeed}
                        className={`px-2 py-0.5 rounded-md text-[9px] font-black tracking-tighter transition-all active:scale-95 ${isMine ? 'bg-white/10 text-white' : 'bg-slate-700/50 text-indigo-300'}`}
                    >
                        {playbackRate}x
                    </button>
                </div>
            </div>

            {/* Waveform visual estática simplificada */}
            <div className="flex items-end gap-0.5 h-6 opacity-30">
                {[3, 5, 2, 6, 4, 7, 3, 5, 8, 4, 6, 2].map((h, i) => (
                    <div 
                        key={i} 
                        className={`w-0.5 rounded-full ${accentColor}`} 
                        style={{ height: `${h * 12.5}%` }} 
                    />
                ))}
            </div>
        </div>
    );
}
