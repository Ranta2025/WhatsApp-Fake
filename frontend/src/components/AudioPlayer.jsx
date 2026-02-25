import React, { useRef, useState, useEffect, useCallback } from 'react';

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

        // Si la duración ya está disponible (cached)
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
        const clickX = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
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

    // Colores
    const playBtnBg = isMine ? 'bg-white/30 hover:bg-white/40' : 'bg-indigo-500 hover:bg-indigo-600';
    const playIconColor = isMine ? 'text-white' : 'text-white';
    const trackBg = isMine ? 'bg-white/20' : 'bg-white/15';
    const trackFill = isMine ? 'bg-white' : 'bg-indigo-400';
    const dotColor = isMine ? 'bg-white' : 'bg-indigo-400';
    const timeColor = isMine ? 'text-white/70' : 'text-indigo-200/70';
    const speedBtnBg = isMine ? 'bg-white/20 hover:bg-white/30 text-white' : 'bg-white/10 hover:bg-white/20 text-indigo-200';

    return (
        <div className="flex items-center gap-2 w-[260px] py-1">
            {/* Audio element oculto */}
            <audio ref={audioRef} src={src} preload="metadata" />

            {/* Botón Play/Pause */}
            <button
                onClick={togglePlay}
                className={`w-10 h-10 rounded-full ${playBtnBg} flex items-center justify-center flex-shrink-0 transition-colors duration-200`}
            >
                {isPlaying ? (
                    /* Icono Pause */
                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${playIconColor}`} viewBox="0 0 24 24" fill="currentColor">
                        <path fillRule="evenodd" d="M6.75 5.25a.75.75 0 01.75-.75H9a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H7.5a.75.75 0 01-.75-.75V5.25zm7.5 0A.75.75 0 0115 4.5h1.5a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H15a.75.75 0 01-.75-.75V5.25z" clipRule="evenodd" />
                    </svg>
                ) : (
                    /* Icono Play */
                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${playIconColor} ml-0.5`} viewBox="0 0 24 24" fill="currentColor">
                        <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
                    </svg>
                )}
            </button>

            {/* Barra de progreso + tiempo */}
            <div className="flex-1 flex flex-col gap-1">
                {/* Barra clickeable */}
                <div
                    ref={progressRef}
                    className={`relative w-full h-1.5 ${trackBg} rounded-full cursor-pointer`}
                    onClick={handleSeek}
                    onTouchStart={handleSeek}
                >
                    {/* Progreso */}
                    <div
                        className={`absolute top-0 left-0 h-full ${trackFill} rounded-full transition-[width] duration-100`}
                        style={{ width: `${progress}%` }}
                    />
                    {/* Bolita de posición */}
                    <div
                        className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 ${dotColor} rounded-full shadow-sm transition-[left] duration-100`}
                        style={{ left: `calc(${progress}% - 6px)` }}
                    />
                </div>

                {/* Tiempo */}
                <div className={`flex justify-between text-[10px] ${timeColor}`}>
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                </div>
            </div>

            {/* Botón velocidad */}
            <button
                onClick={cycleSpeed}
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0 transition-colors duration-200 ${speedBtnBg}`}
                title="Cambiar velocidad"
            >
                {playbackRate}x
            </button>
        </div>
    );
}
