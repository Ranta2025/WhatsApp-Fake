import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import api from '../../../api/axios';
import { useStatus } from '../context/StatusContext';

const TEXT_MAX = 700;
const CAPTION_MAX = 700;

const BG_COLORS = [
    '#25D366', // verde WhatsApp
    '#128C7E',
    '#075E54',
    '#34B7F1',
    '#7C3AED',
    '#DB2777',
    '#F59E0B',
    '#0EA5E9',
];

const CloseIcon = () => (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
);

/**
 * Composer de estados: pantalla completa (portal a document.body) con dos
 * modos, texto sobre fondo de color o foto/video con leyenda opcional.
 */
export default function StatusComposer() {
    const { composerOpen, closeComposer, publishStatus } = useStatus();
    const [mode, setMode] = useState(null); // null | 'text' | 'media'
    const [text, setText] = useState('');
    const [colorIndex, setColorIndex] = useState(0);
    const [file, setFile] = useState(null);
    const [filePreviewUrl, setFilePreviewUrl] = useState(null);
    const [fileKind, setFileKind] = useState(null); // 'image' | 'video'
    const [caption, setCaption] = useState('');
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [error, setError] = useState('');
    const fileInputRef = useRef(null);
    const containerRef = useRef(null);

    const reset = useCallback(() => {
        setMode(null);
        setText('');
        setColorIndex(0);
        setFile(null);
        if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
        setFilePreviewUrl(null);
        setFileKind(null);
        setCaption('');
        setUploading(false);
        setUploadProgress(0);
        setError('');
    }, [filePreviewUrl]);

    // R3-composer-escape-reset: Escape debe pasar por el mismo camino de
    // cierre+reset que el botón de cerrar (handleClose), no solo cerrar el
    // overlay: de lo contrario queda mode/text/file/objectURL de la sesión
    // anterior la próxima vez que se abre el composer, y el object URL de la
    // vista previa nunca se revoca (memory leak).
    const handleClose = useCallback(() => {
        closeComposer();
        reset();
    }, [closeComposer, reset]);

    // Bloquear scroll del body, enfocar y permitir cerrar con Escape mientras está abierto.
    useEffect(() => {
        if (!composerOpen) return;
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        containerRef.current?.focus();
        const onKeyDown = (e) => {
            if (e.key === 'Escape') handleClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => {
            document.body.style.overflow = prevOverflow;
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [composerOpen, handleClose]);

    // Revocar el object URL de la vista previa también al desmontar el
    // composer (no solo en reset()), por si el componente se desmonta con
    // una vista previa activa.
    const filePreviewUrlRef = useRef(null);
    useEffect(() => { filePreviewUrlRef.current = filePreviewUrl; }, [filePreviewUrl]);
    useEffect(() => () => {
        if (filePreviewUrlRef.current) URL.revokeObjectURL(filePreviewUrlRef.current);
    }, []);

    if (!composerOpen) return null;

    const handleFileSelect = (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        const kind = f.type.startsWith('video/') ? 'video' : f.type.startsWith('image/') ? 'image' : null;
        if (!kind) {
            setError('Selecciona una imagen o un video.');
            return;
        }
        if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
        setFile(f);
        setFileKind(kind);
        setFilePreviewUrl(URL.createObjectURL(f));
        setError('');
    };

    const publishText = async () => {
        setError('');
        setUploading(true);
        try {
            await publishStatus({
                type: 'text',
                text,
                backgroundColor: BG_COLORS[colorIndex],
            });
            handleClose();
        } catch (err) {
            setError(err.response?.data?.error || err.message || 'Error al publicar el estado');
        } finally {
            setUploading(false);
        }
    };

    const publishMedia = async () => {
        if (!file) return;
        setError('');
        setUploading(true);
        setUploadProgress(0);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const { data } = await api.post('/api/v1/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                onUploadProgress: (evt) => {
                    if (!evt.total) return;
                    setUploadProgress(Math.round((evt.loaded * 100) / evt.total));
                },
            });
            if (!data?.url) throw new Error('Respuesta del servidor inválida.');
            await publishStatus({
                type: data.mediaType || fileKind,
                mediaUrl: data.url,
                caption,
            });
            handleClose();
        } catch (err) {
            setError(err.response?.data?.error || err.message || 'Error al publicar el estado');
        } finally {
            setUploading(false);
        }
    };

    const canPublishText = text.trim().length > 0 && text.length <= TEXT_MAX && !uploading;
    const canPublishMedia = !!file && caption.length <= CAPTION_MAX && !uploading;

    const content = (
        <div
            ref={containerRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Crear estado"
            className="fixed inset-0 z-status bg-slate-950 flex flex-col outline-none animate-fade-in"
        >
            {/* Cabecera */}
            <header className="flex items-center justify-between px-4 py-3 flex-shrink-0">
                <button
                    onClick={handleClose}
                    className="w-10 h-10 rounded-full flex items-center justify-center text-slate-300 hover:bg-white/10 transition-colors"
                    aria-label="Cerrar"
                >
                    <CloseIcon />
                </button>
                <h2 className="text-slate-100 font-semibold">Nuevo estado</h2>
                <div className="w-10 h-10" />
            </header>

            {!mode && (
                <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6">
                    <button
                        onClick={() => setMode('text')}
                        className="w-full max-w-xs py-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold transition-colors"
                    >
                        Texto
                    </button>
                    <button
                        onClick={() => { setMode('media'); fileInputRef.current?.click(); }}
                        className="w-full max-w-xs py-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold transition-colors"
                    >
                        Foto o video
                    </button>
                </div>
            )}

            {mode === 'text' && (
                <div
                    className="flex-1 flex flex-col items-center justify-center px-6 transition-colors"
                    style={{ backgroundColor: BG_COLORS[colorIndex] }}
                >
                    <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value.slice(0, TEXT_MAX))}
                        placeholder="Escribe un estado..."
                        aria-label="Texto del estado"
                        maxLength={TEXT_MAX}
                        className="w-full max-w-lg bg-transparent text-white text-2xl font-medium text-center placeholder-white/60 resize-none outline-none min-h-[8rem]"
                        autoFocus
                    />
                    <span className="text-white/70 text-xs mt-2">{text.length}/{TEXT_MAX}</span>
                </div>
            )}

            {mode === 'media' && (
                <div className="flex-1 flex flex-col items-center justify-center px-6 gap-4 overflow-y-auto py-4">
                    {filePreviewUrl ? (
                        fileKind === 'image' ? (
                            <img src={filePreviewUrl} alt="Vista previa" className="max-h-[55vh] max-w-full object-contain rounded-xl" />
                        ) : (
                            <video src={filePreviewUrl} className="max-h-[55vh] max-w-full object-contain rounded-xl" controls muted playsInline />
                        )
                    ) : (
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full max-w-xs py-10 rounded-2xl border-2 border-dashed border-slate-700 text-slate-400 hover:border-indigo-500/50 hover:text-indigo-300 transition-colors"
                        >
                            Toca para elegir una foto o video
                        </button>
                    )}
                    {filePreviewUrl && (
                        <input
                            type="text"
                            value={caption}
                            onChange={(e) => setCaption(e.target.value.slice(0, CAPTION_MAX))}
                            placeholder="Añade una leyenda..."
                            aria-label="Leyenda del estado"
                            className="w-full max-w-lg px-4 py-2.5 rounded-xl bg-slate-800/70 text-slate-100 placeholder-slate-500 outline-none focus:ring-1 focus:ring-indigo-500/40"
                        />
                    )}
                </div>
            )}

            <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                onChange={handleFileSelect}
                className="hidden"
            />

            {error && (
                <div className="px-6 pb-2 text-center text-sm text-rose-400">{error}</div>
            )}

            {mode && (
                <footer className="px-6 py-4 flex items-center justify-end gap-3 flex-shrink-0">
                    {uploading && mode === 'media' && (
                        <span className="text-xs text-slate-400 mr-auto">Subiendo… {uploadProgress}%</span>
                    )}
                    <button
                        onClick={mode === 'text' ? () => setColorIndex(i => (i + 1) % BG_COLORS.length) : () => fileInputRef.current?.click()}
                        className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-slate-100 text-sm font-medium transition-colors"
                        aria-label={mode === 'text' ? 'Cambiar color de fondo' : 'Elegir otro archivo'}
                    >
                        {mode === 'text' ? 'Color' : 'Cambiar'}
                    </button>
                    <button
                        onClick={mode === 'text' ? publishText : publishMedia}
                        disabled={mode === 'text' ? !canPublishText : !canPublishMedia}
                        className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
                    >
                        Publicar
                    </button>
                </footer>
            )}
        </div>
    );

    return createPortal(content, document.body);
}
