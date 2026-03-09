import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import api from '../api/axios';

/**
 * MediaUploadMenu Component
 * Proporciona una interfaz para capturar cámara, fotos, videos y documentos.
 * Maneja permisos de cámara cross-browser con fallbacks apropiados.
 * 
 * @param {Object} props
 * @param {Function} props.onUploadSuccess - Callback al subir exitosamente un archivo
 * @param {Function} props.onUploadError - Callback al fallar una subida
 * @param {Function} props.onClose - Callback para cerrar el menú
 */
export default function MediaUploadMenu({ onUploadSuccess, onUploadError, onClose }) {
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [showCameraPreview, setShowCameraPreview] = useState(false);
    const [cameraStream, setCameraStream] = useState(null);
    const [menuPosition, setMenuPosition] = useState({ left: 12, bottom: 72, width: 224 });
    const fileInputRef = useRef(null);
    const videoPreviewRef = useRef(null);
    const canvasRef = useRef(null);
    const menuRef = useRef(null);
    const [uploadType, setUploadType] = useState(null);

    // Extensiones permitidas para documentos y sus tipos MIME asociados
    const ALLOWED_DOC_EXTENSIONS = ['.doc', '.docx', '.pdf', '.xls', '.xlsx', '.ppt', '.pptx', '.txt'];
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

    // Limpiar stream de cámara al desmontar
    useEffect(() => {
        return () => {
            if (cameraStream) {
                cameraStream.getTracks().forEach(track => track.stop());
            }
        };
    }, [cameraStream]);

    useEffect(() => {
        if (!showCameraPreview) return undefined;

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [showCameraPreview]);

    // Conectar stream al video preview cuando esté disponible
    useEffect(() => {
        if (videoPreviewRef.current && cameraStream) {
            videoPreviewRef.current.srcObject = cameraStream;
        }
    }, [cameraStream, showCameraPreview]);

    useEffect(() => {
        const updateMenuPosition = () => {
            const anchor = menuRef.current?.parentElement;
            if (!anchor) return;

            const rect = anchor.getBoundingClientRect();
            const preferredWidth = 224;
            const viewportPadding = 12;
            const left = Math.min(
                Math.max(rect.left, viewportPadding),
                Math.max(viewportPadding, window.innerWidth - preferredWidth - viewportPadding)
            );

            setMenuPosition({
                left,
                bottom: Math.max(window.innerHeight - rect.top + 8, 72),
                width: Math.min(preferredWidth, window.innerWidth - viewportPadding * 2),
            });
        };

        updateMenuPosition();
        window.addEventListener('resize', updateMenuPosition);
        window.addEventListener('scroll', updateMenuPosition, true);

        return () => {
            window.removeEventListener('resize', updateMenuPosition);
            window.removeEventListener('scroll', updateMenuPosition, true);
        };
    }, []);

    /**
     * Detecta si el dispositivo es móvil (soporta capture attribute nativo).
     */
    const isMobileDevice = useCallback(() => {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
            || ('ontouchstart' in window && navigator.maxTouchPoints > 0);
    }, []);

    /**
     * Solicita acceso a la cámara con manejo exhaustivo de errores cross-browser.
     * @returns {Promise<MediaStream>}
     */
    const requestCameraAccess = useCallback(async () => {
        // 1. Verificar que la API existe
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error(
                window.location.protocol === 'http:' && window.location.hostname !== 'localhost'
                    ? 'El acceso a la cámara requiere una conexión segura (HTTPS). Contacta al administrador del sitio.'
                    : 'Tu navegador no soporta el acceso a la cámara. Prueba con Chrome, Firefox, Safari o Edge.'
            );
        }

        // 2. Verificar estado del permiso (sin solicitarlo)
        try {
            if ('permissions' in navigator) {
                const permStatus = await navigator.permissions.query({ name: 'camera' });
                if (permStatus.state === 'denied') {
                    throw new Error(
                        'El acceso a la cámara está bloqueado. Para habilitarlo:\n\n' +
                        '• Chrome: Haz clic en el ícono de candado en la barra de direcciones → Permisos → Cámara → Permitir\n' +
                        '• Firefox: Haz clic en el ícono de candado → Permisos → Cámara → Desbloquear\n' +
                        '• Safari: Preferencias → Websites → Cámara → Permitir\n' +
                        '• Edge: Haz clic en el candado → Permisos → Cámara → Permitir'
                    );
                }
            }
        } catch (permError) {
            // Si la query de permisos falla (Safari), continuar con getUserMedia
            if (permError.message.includes('bloqueado')) throw permError;
        }

        // 3. Solicitar acceso a la cámara con constraints progresivos
        let stream = null;
        const constraints = [
            // Intento 1: Video HD + Audio
            { video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false },
            // Intento 2: Video básico
            { video: { facingMode: 'environment' }, audio: false },
            // Intento 3: Cualquier video disponible
            { video: true, audio: false },
        ];

        for (const constraint of constraints) {
            try {
                stream = await navigator.mediaDevices.getUserMedia(constraint);
                break;
            } catch (err) {
                if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                    throw new Error(
                        'Permiso de cámara denegado. Permite el acceso a la cámara en tu navegador e intenta de nuevo.'
                    );
                }
                if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
                    throw new Error('No se detectó ninguna cámara en este dispositivo.');
                }
                if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
                    throw new Error(
                        'La cámara está siendo usada por otra aplicación. Cierra otras apps que usen la cámara e intenta de nuevo.'
                    );
                }
                // Si es el último intento, propagar el error
                if (constraint === constraints[constraints.length - 1]) {
                    throw new Error('No se pudo acceder a la cámara: ' + (err.message || err.name));
                }
            }
        }

        return stream;
    }, []);

    /**
     * Abre la cámara en modo preview (desktop) o usa input con capture (mobile).
     */
    const handleCameraCapture = useCallback(async () => {
        if (isMobileDevice()) {
            // En móvil: usar el input nativo con capture
            setUploadType('camera');
            if (fileInputRef.current) {
                fileInputRef.current.accept = 'image/*';
                fileInputRef.current.setAttribute('capture', 'environment');
                fileInputRef.current.click();
            }
            return;
        }

        // En desktop: abrir preview de cámara con getUserMedia
        try {
            const stream = await requestCameraAccess();
            setCameraStream(stream);
            setShowCameraPreview(true);
        } catch (err) {
            onUploadError(err.message);
        }
    }, [isMobileDevice, requestCameraAccess, onUploadError]);

    /**
     * Captura una foto del stream de la cámara y la sube.
     */
    const capturePhoto = useCallback(async () => {
        if (!videoPreviewRef.current || !cameraStream) return;

        try {
            const video = videoPreviewRef.current;
            const canvas = canvasRef.current || document.createElement('canvas');
            canvas.width = video.videoWidth || 640;
            canvas.height = video.videoHeight || 480;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            // Detener cámara
            cameraStream.getTracks().forEach(track => track.stop());
            setCameraStream(null);
            setShowCameraPreview(false);

            // Convertir a blob y subir
            const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
            if (!blob) {
                onUploadError('Error al capturar la foto.');
                return;
            }

            setIsUploading(true);
            setUploadProgress(0);
            const formData = new FormData();
            formData.append('file', blob, `camera_${Date.now()}.jpg`);

            const response = await api.post('/api/v1/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                onUploadProgress: (progressEvent) => {
                    const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                    setUploadProgress(progress);
                }
            });

            if (response.data && response.data.url) {
                onUploadSuccess(response.data.url, 'image');
            } else {
                throw new Error('Respuesta del servidor inválida.');
            }
        } catch (error) {
            const msg = error.response?.data?.error || error.message || 'Error al subir la foto';
            onUploadError(msg);
        } finally {
            setIsUploading(false);
            onClose();
        }
    }, [cameraStream, onUploadSuccess, onUploadError, onClose]);

    /**
     * Cierra el preview de la cámara.
     */
    const closeCameraPreview = useCallback(() => {
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
            setCameraStream(null);
        }
        setShowCameraPreview(false);
    }, [cameraStream]);

    const handleFileSelect = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // 1. Validación de tamaño (10MB)
        if (file.size > MAX_FILE_SIZE) {
            onUploadError(`El archivo supera el límite de 10MB (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
            return;
        }

        // 2. Validación de tipo de archivo
        if (uploadType === 'document') {
            const fileName = file.name.toLowerCase();
            const isValidExt = ALLOWED_DOC_EXTENSIONS.some(ext => fileName.endsWith(ext));
            if (!isValidExt) {
                onUploadError('Formato de documento no permitido. Use PDF, Word, Excel, PPT o TXT.');
                return;
            }
        } else if (uploadType === 'image' && !file.type.startsWith('image/')) {
            onUploadError('El archivo seleccionado no es una imagen válida.');
            return;
        } else if (uploadType === 'video' && !file.type.startsWith('video/')) {
            onUploadError('El archivo seleccionado no es un video válido.');
            return;
        }

        setIsUploading(true);
        setUploadProgress(0);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await api.post('/api/v1/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                onUploadProgress: (progressEvent) => {
                    const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                    setUploadProgress(progress);
                }
            });
            
            if (response.data && response.data.url) {
                const finalType = uploadType === 'camera' ? 'image' : (response.data.mediaType || uploadType);
                onUploadSuccess(response.data.url, finalType);
            } else {
                throw new Error('Respuesta del servidor inválida.');
            }
        } catch (error) {
            const msg = error.response?.data?.error || error.message || 'Error al subir el archivo';
            onUploadError(msg);
        } finally {
            setIsUploading(false);
            onClose();
        }
    };

    const triggerFileInput = async (type, accept, capture = false) => {
        setUploadType(type);
        if (fileInputRef.current) {
            fileInputRef.current.accept = accept;
            if (capture) {
                fileInputRef.current.setAttribute('capture', 'environment');
            } else {
                fileInputRef.current.removeAttribute('capture');
            }
            fileInputRef.current.click();
        }
    };

    // Si se muestra el preview de la cámara, renderizar la interfaz de captura
    if (showCameraPreview) {
        return createPortal(
            <div className="fixed inset-0 z-[10020] bg-black/95 text-white">
                <canvas ref={canvasRef} className="hidden" />

                <div className="relative flex min-h-[100dvh] flex-col px-3 pb-[max(20px,env(safe-area-inset-bottom))] pt-[max(12px,env(safe-area-inset-top))] sm:px-6">
                    <div className="flex items-center justify-between pb-3">
                        <div className="rounded-full bg-black/35 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white/70 backdrop-blur-sm">
                            Cámara
                        </div>
                        <button
                            onClick={closeCameraPreview}
                            className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-white transition-colors hover:bg-white/20"
                            aria-label="Cerrar cámara"
                        >
                            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[28px] bg-slate-950 ring-1 ring-white/10 sm:flex-none sm:min-h-[320px] sm:max-h-[min(68vh,720px)]">
                        <video
                            ref={videoPreviewRef}
                            autoPlay
                            playsInline
                            muted
                            className="h-full w-full object-cover"
                        />
                        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/45 to-transparent" />
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/55 to-transparent" />
                    </div>

                    <div className="flex shrink-0 items-center justify-center gap-5 py-4 sm:py-5">
                        <button
                            onClick={closeCameraPreview}
                            className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-slate-800/90 text-white transition-colors hover:bg-slate-700"
                            aria-label="Cancelar"
                        >
                            <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                        <button
                            onClick={capturePhoto}
                            className="inline-flex h-20 w-20 items-center justify-center rounded-full border-4 border-white/30 bg-white shadow-2xl shadow-black/40 transition-transform hover:scale-[1.03]"
                            aria-label="Tomar foto"
                        >
                            <div className="h-16 w-16 rounded-full border-2 border-slate-300 bg-white" />
                        </button>
                        <div className="h-14 w-14" aria-hidden="true" />
                    </div>
                </div>
            </div>,
            document.body
        );
    }

    return (
        <>
            <div ref={menuRef} className="hidden" aria-hidden="true" />
            {createPortal(
                <div
                    className="fixed z-[10010] animate-slide-up origin-bottom-left"
                    style={{
                        left: menuPosition.left,
                        bottom: menuPosition.bottom,
                        width: menuPosition.width,
                    }}
                >
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        className="hidden" 
                        onChange={handleFileSelect}
                    />

                    <div className="rounded-3xl border border-white/10 bg-slate-900/96 p-2 shadow-2xl backdrop-blur-xl">
                        {isUploading ? (
                            <div className="flex min-h-[120px] flex-col items-center justify-center p-6 text-indigo-300">
                                <div className="relative mb-3 h-12 w-12">
                                    <svg className="h-full w-full animate-spin" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold">
                                        {uploadProgress}%
                                    </span>
                                </div>
                                <span className="animate-pulse text-xs font-bold uppercase tracking-widest">Subiendo...</span>
                            </div>
                        ) : (
                            <>
                                <button 
                                    onClick={handleCameraCapture}
                                    className="group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm text-white transition-all hover:bg-white/10"
                                >
                                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 shadow-lg shadow-emerald-500/10 transition-all group-hover:scale-110 group-active:scale-95">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="font-bold text-slate-100">Cámara</span>
                                        <span className="text-[10px] text-slate-400">Captura inmediata</span>
                                    </div>
                                </button>

                                <button 
                                    onClick={() => triggerFileInput('image', 'image/*')}
                                    className="group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm text-white transition-all hover:bg-white/10"
                                >
                                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/20 text-blue-400 shadow-lg shadow-blue-500/10 transition-all group-hover:scale-110 group-active:scale-95">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                        </svg>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="font-bold text-slate-100">Galería</span>
                                        <span className="text-[10px] text-slate-400">Fotos y videos</span>
                                    </div>
                                </button>

                                <button 
                                    onClick={() => triggerFileInput('document', '.doc,.docx,.pdf,.xls,.xlsx,.ppt,.pptx,.txt')}
                                    className="group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm text-white transition-all hover:bg-white/10"
                                >
                                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-500/20 text-purple-400 shadow-lg shadow-purple-500/10 transition-all group-hover:scale-110 group-active:scale-95">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="font-bold text-slate-100">Documento</span>
                                        <span className="text-[10px] text-slate-400">Word, PDF, Excel...</span>
                                    </div>
                                </button>
                            </>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
