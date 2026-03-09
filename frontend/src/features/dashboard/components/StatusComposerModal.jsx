import React, { useEffect, useRef, useState } from 'react';
import api from '../../../api/axios';
import { useDashboard } from '../context/DashboardContext';

const BACKGROUNDS = ['#0f172a', '#1d4ed8', '#0f766e', '#be123c', '#7c3aed', '#ea580c'];

export default function StatusComposerModal({ isOpen, onClose }) {
    const { createStatus, addToast } = useDashboard();
    const [text, setText] = useState('');
    const [background, setBackground] = useState(BACKGROUNDS[0]);
    const [mediaUrl, setMediaUrl] = useState('');
    const [mediaType, setMediaType] = useState('');
    const [previewUrl, setPreviewUrl] = useState('');
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);
    const fileInputRef = useRef(null);

    useEffect(() => {
        if (!isOpen) {
            setText('');
            setBackground(BACKGROUNDS[0]);
            setMediaUrl('');
            setMediaType('');
            setPreviewUrl('');
            setUploading(false);
            setSaving(false);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handlePickFile = (accept) => {
        if (!fileInputRef.current) return;
        fileInputRef.current.accept = accept;
        fileInputRef.current.click();
    };

    const handleFileChange = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        const detectedType = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : '';
        if (!detectedType) {
            addToast({ type: 'error', message: 'Solo puedes publicar fotos o videos en tus estados.' });
            return;
        }

        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const { data } = await api.post('/api/v1/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setMediaUrl(data.url);
            setMediaType(detectedType);
            setPreviewUrl(URL.createObjectURL(file));
        } catch (error) {
            console.error('Error uploading status media:', error);
            addToast({ type: 'error', message: 'No pudimos subir el archivo. Inténtalo nuevamente.' });
        } finally {
            setUploading(false);
        }
    };

    const handleSubmit = async () => {
        if (!text.trim() && !mediaUrl) {
            addToast({ type: 'error', message: 'Escribe algo o selecciona una foto o un video.' });
            return;
        }
        setSaving(true);
        try {
            await createStatus({ text: text.trim(), mediaUrl, mediaType, background });
            onClose();
        } catch (error) {
            console.error('Error creating status:', error);
            addToast({ type: 'error', message: error?.response?.data?.error || 'No pudimos publicar tu estado.' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[10010] flex items-start justify-center overflow-y-auto bg-slate-950/80 p-2 backdrop-blur-md sm:items-center sm:p-4" onClick={onClose}>
            <div className="my-0 flex w-full max-w-3xl flex-col overflow-hidden rounded-[1.5rem] border border-white/10 bg-slate-900 shadow-2xl shadow-black/30 sm:my-6 sm:max-h-[calc(100dvh-2rem)] sm:rounded-[2rem]" onClick={(event) => event.stopPropagation()}>
                <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-white/5 bg-slate-900/95 px-4 py-3 backdrop-blur-md sm:px-6 sm:py-4">
                    <div>
                        <h2 className="text-lg font-semibold text-white sm:text-xl">Nuevo estado</h2>
                        <p className="text-xs text-slate-400 sm:text-sm">Comparte un texto, una foto o un video por 24 horas.</p>
                    </div>
                    <button onClick={onClose} className="shrink-0 rounded-2xl p-2 text-slate-400 transition-colors hover:bg-white/5 hover:text-white" aria-label="Cerrar compositor de estados">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                <div className="grid max-h-[calc(100dvh-4.5rem)] gap-0 overflow-y-auto lg:max-h-none lg:grid-cols-[1.15fr_0.85fr]">
                    <div className="p-3 sm:p-4 lg:p-6">
                        <div className="flex min-h-[260px] flex-col justify-between rounded-[1.4rem] border border-white/10 p-4 shadow-inner sm:min-h-[340px] sm:rounded-[1.75rem] sm:p-6 lg:min-h-[420px]" style={{ background: mediaUrl ? '#020617' : `linear-gradient(135deg, ${background}, #020617)` }}>
                            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-white/60">Vista previa</div>
                            <div className="flex flex-1 items-center justify-center py-4 sm:py-6">
                                {mediaUrl ? (
                                    mediaType === 'video' ? (
                                        <video src={previewUrl || mediaUrl} controls className="max-h-[220px] w-full rounded-[1rem] bg-black object-contain sm:max-h-[280px] lg:max-h-[320px] lg:rounded-[1.25rem]" />
                                    ) : (
                                        <img src={previewUrl || mediaUrl} alt="Vista previa del estado" className="max-h-[220px] w-full rounded-[1rem] object-contain sm:max-h-[280px] lg:max-h-[320px] lg:rounded-[1.25rem]" />
                                    )
                                ) : (
                                    <p className="max-w-md whitespace-pre-wrap text-center text-xl font-semibold leading-tight text-white sm:text-2xl lg:text-3xl">{text.trim() || 'Tu mensaje aparecerá aquí'}</p>
                                )}
                            </div>
                            {mediaUrl && text.trim() && (
                                <p className="rounded-2xl bg-black/30 px-4 py-3 text-sm text-slate-100 backdrop-blur-sm">{text.trim()}</p>
                            )}
                        </div>
                    </div>
                    <div className="border-t border-white/5 bg-slate-950/60 p-4 lg:border-l lg:border-t-0 lg:p-6">
                        <label className="mb-2 block text-sm font-medium text-slate-200">Escribe algo</label>
                        <textarea value={text} onChange={(event) => setText(event.target.value.slice(0, 700))} rows={4} className="w-full resize-none rounded-3xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-500/40 focus:ring-2 focus:ring-cyan-500/10 sm:rows-5 lg:rows-6" placeholder="Comparte una idea, una noticia o algo importante." />
                        <div className="mt-2 text-right text-xs text-slate-500">{text.length}/700</div>
                        <div className="mt-5">
                            <div className="mb-2 text-sm font-medium text-slate-200">Color del estado</div>
                            <div className="flex flex-wrap gap-3">
                                {BACKGROUNDS.map((color) => (
                                    <button key={color} type="button" onClick={() => setBackground(color)} className={`h-10 w-10 rounded-2xl border transition ${background === color ? 'border-white scale-105' : 'border-white/10'}`} style={{ background: color }} aria-label={`Seleccionar color ${color}`} />
                                ))}
                            </div>
                        </div>
                        <div className="mt-5 space-y-3">
                            <button type="button" onClick={() => handlePickFile('image/*')} className="flex w-full items-center justify-between rounded-3xl border border-white/10 bg-slate-900 px-4 py-3 text-left text-sm text-slate-200 transition hover:border-sky-400/30 hover:bg-slate-800">
                                <span>Subir foto</span><span className="text-slate-500">JPG, PNG, WEBP</span>
                            </button>
                            <button type="button" onClick={() => handlePickFile('video/*')} className="flex w-full items-center justify-between rounded-3xl border border-white/10 bg-slate-900 px-4 py-3 text-left text-sm text-slate-200 transition hover:border-sky-400/30 hover:bg-slate-800">
                                <span>Subir video</span><span className="text-slate-500">MP4, WEBM, MOV</span>
                            </button>
                            {mediaUrl && (
                                <button type="button" onClick={() => { setMediaUrl(''); setMediaType(''); setPreviewUrl(''); }} className="w-full rounded-3xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-200 transition hover:bg-red-500/15">
                                    Quitar archivo actual
                                </button>
                            )}
                        </div>
                        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
                        <div className="sticky bottom-0 mt-6 flex gap-3 border-t border-white/5 bg-slate-950/95 pt-4 backdrop-blur-md">
                            <button onClick={onClose} className="flex-1 rounded-3xl border border-white/10 px-4 py-3 text-sm font-medium text-slate-300 transition hover:bg-white/5">Volver</button>
                            <button onClick={handleSubmit} disabled={uploading || saving} className="flex-1 rounded-3xl bg-gradient-to-r from-sky-500 to-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:from-sky-400 hover:to-indigo-500 disabled:cursor-not-allowed disabled:opacity-60">
                                {uploading ? 'Subiendo archivo...' : saving ? 'Publicando...' : 'Publicar estado'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}