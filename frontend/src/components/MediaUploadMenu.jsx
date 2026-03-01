import React, { useState, useRef, useEffect, useCallback } from 'react';
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
    const fileInputRef = useRef(null);
    const videoPreviewRef = useRef(null);
    const canvasRef = useRef(null);
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

    // Conectar stream al video preview cuando esté disponible
    useEffect(() => {
        if (videoPreviewRef.current && cameraStream) {
            videoPreviewRef.current.srcObject = cameraStream;
        }
    }, [cameraStream, showCameraPreview]);

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
        return (
            <div className="fixed inset-0 z-[9999] bg-black flex flex-col items-center justify-center">
                <canvas ref={canvasRef} className="hidden" />
                <div className="relative w-full max-w-lg flex-1 flex items-center justify-center">
                    <video 
                        ref={videoPreviewRef}
                        autoPlay 
                        playsInline 
                        muted 
                        className="w-full h-full object-cover rounded-xl max-h-[70vh]"
                    />
                </div>
                <div className="flex items-center gap-6 py-6">
                    <button
                        onClick={closeCameraPreview}
                        className="w-14 h-14 bg-slate-800 hover:bg-slate-700 rounded-full flex items-center justify-center transition-all text-white"
                        aria-label="Cancelar"
                    >
                        <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                    <button
                        onClick={capturePhoto}
                        className="w-20 h-20 bg-white hover:bg-gray-200 rounded-full flex items-center justify-center transition-all shadow-lg border-4 border-white/50"
                        aria-label="Tomar foto"
                    >
                        <div className="w-16 h-16 bg-white rounded-full border-2 border-gray-300"></div>
                    </button>
                    <div className="w-14 h-14"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="absolute bottom-full mb-2 left-0 bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-2 flex flex-col gap-1 z-50 min-w-[200px] animate-slide-up origin-bottom-left">
            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                onChange={handleFileSelect}
            />
            
            {isUploading ? (
                <div className="flex flex-col items-center justify-center p-6 text-indigo-300 min-h-[120px]">
                    <div className="relative w-12 h-12 mb-3">
                        <svg className="animate-spin h-full w-full" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold">
                            {uploadProgress}%
                        </span>
                    </div>
                    <span className="text-xs font-bold uppercase tracking-widest animate-pulse">Subiendo...</span>
                </div>
            ) : (
                <>
                    <button 
                        onClick={handleCameraCapture}
                        className="flex items-center gap-3 px-3 py-2.5 hover:bg-white/10 rounded-xl transition-all text-left text-sm text-white group"
                    >
                        <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center group-hover:scale-110 group-active:scale-95 transition-all shadow-lg shadow-emerald-500/10">
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
                        className="flex items-center gap-3 px-3 py-2.5 hover:bg-white/10 rounded-xl transition-all text-left text-sm text-white group"
                    >
                        <div className="w-10 h-10 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center group-hover:scale-110 group-active:scale-95 transition-all shadow-lg shadow-blue-500/10">
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
                        className="flex items-center gap-3 px-3 py-2.5 hover:bg-white/10 rounded-xl transition-all text-left text-sm text-white group"
                    >
                        <div className="w-10 h-10 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center group-hover:scale-110 group-active:scale-95 transition-all shadow-lg shadow-purple-500/10">
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
    );
}
