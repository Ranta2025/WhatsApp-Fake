import { useState } from 'react';
import axios from 'axios';

export default function BugReportModal({ isOpen, onClose }) {
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        steps: '',
        expected: '',
        actual: '',
        user_email: ''
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitStatus, setSubmitStatus] = useState(null); // 'success', 'error', null

    // Detectar información del sistema automáticamente
    const getSystemInfo = () => {
        const ua = navigator.userAgent;
        let browser = 'Unknown';
        
        if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Chrome';
        else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
        else if (ua.includes('Firefox')) browser = 'Firefox';
        else if (ua.includes('Edg')) browser = 'Edge';
        else if (ua.includes('Opera') || ua.includes('OPR')) browser = 'Opera';

        let os = 'Unknown';
        if (ua.includes('Windows')) os = 'Windows';
        else if (ua.includes('Mac')) os = 'macOS';
        else if (ua.includes('Linux')) os = 'Linux';
        else if (ua.includes('Android')) os = 'Android';
        else if (ua.includes('iOS')) os = 'iOS';

        const screenSize = `${window.screen.width}x${window.screen.height}`;

        return { browser, os, screen_size: screenSize };
    };

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        setSubmitStatus(null);

        try {
            const systemInfo = getSystemInfo();
            const reportData = {
                ...formData,
                ...systemInfo
            };

            // Cambiar esta URL según tu configuración
            const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';
            
            await axios.post(`${API_URL}/api/v1/bug-report`, reportData);
            
            setSubmitStatus('success');
            
            // Limpiar formulario
            setFormData({
                title: '',
                description: '',
                steps: '',
                expected: '',
                actual: '',
                user_email: ''
            });

            // Cerrar modal después de 2 segundos
            setTimeout(() => {
                onClose();
                setSubmitStatus(null);
            }, 2000);

        } catch (error) {
            console.error('Error al enviar reporte:', error);
            setSubmitStatus('error');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.99),rgba(15,23,42,0.95))] shadow-[0_36px_140px_-50px_rgba(15,23,42,0.95)]">
                <div className="sticky top-0 flex items-center justify-between rounded-t-[2rem] border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.18),transparent_42%),linear-gradient(135deg,rgba(255,255,255,0.05),rgba(255,255,255,0.01))] px-6 py-5 backdrop-blur-xl">
                    <div className="flex items-center gap-2">
                        <span className="text-2xl">🐛</span>
                        <h2 className="text-2xl font-bold text-white">Reportar un problema</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-white hover:bg-white/20 rounded-lg p-2 transition"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div className="grid gap-3 rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300 md:grid-cols-3">
                        <div className="rounded-2xl bg-slate-950/60 px-3 py-3"><div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-300/80">Claridad</div><div className="mt-1 font-semibold text-white">Cuéntanos qué pasó</div></div>
                        <div className="rounded-2xl bg-slate-950/60 px-3 py-3"><div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-300/80">Contexto</div><div className="mt-1 font-semibold text-white">Pasos y detalles útiles</div></div>
                        <div className="rounded-2xl bg-slate-950/60 px-3 py-3"><div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300/80">Seguimiento</div><div className="mt-1 font-semibold text-white">Mejora más rápida</div></div>
                    </div>

                    <p className="text-sm text-slate-400">
                        Gracias por ayudarnos a mejorar tu experiencia. Compartir este detalle nos ayuda a corregirlo más rápido.
                    </p>

                    {/* Título */}
                    <div>
                        <label className="block text-white font-semibold mb-2">
                            Título del problema <span className="text-red-400">*</span>
                        </label>
                        <input
                            type="text"
                            name="title"
                            value={formData.title}
                            onChange={handleChange}
                            required
                            placeholder="Ej: No puedo enviar mensajes desde esta pantalla"
                            className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                        />
                    </div>

                    {/* Descripción */}
                    <div>
                        <label className="block text-white font-semibold mb-2">
                            Descripción <span className="text-red-400">*</span>
                        </label>
                        <textarea
                            name="description"
                            value={formData.description}
                            onChange={handleChange}
                            required
                            rows="3"
                            placeholder="Describe el problema que encontraste..."
                            className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                        />
                    </div>

                    {/* Pasos para reproducir */}
                    <div>
                        <label className="block text-white font-semibold mb-2">
                            Cómo ocurrió
                        </label>
                        <textarea
                            name="steps"
                            value={formData.steps}
                            onChange={handleChange}
                            rows="3"
                            placeholder="1. Entré a la conversación&#10;2. Intenté adjuntar un archivo&#10;3. La acción no respondió como esperaba..."
                            className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                        />
                    </div>

                    {/* Comportamiento esperado y actual en dos columnas */}
                    <div className="grid md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-white font-semibold mb-2">
                                Comportamiento Esperado
                            </label>
                            <textarea
                                name="expected"
                                value={formData.expected}
                                onChange={handleChange}
                                rows="2"
                                placeholder="¿Qué debería pasar?"
                                className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white placeholder-slate-500 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
                            />
                        </div>
                        <div>
                            <label className="block text-white font-semibold mb-2">
                                Comportamiento Actual
                            </label>
                            <textarea
                                name="actual"
                                value={formData.actual}
                                onChange={handleChange}
                                rows="2"
                                placeholder="¿Qué pasa realmente?"
                                className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white placeholder-slate-500 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
                            />
                        </div>
                    </div>

                    {/* Email del usuario */}
                    <div>
                        <label className="block text-white font-semibold mb-2">
                            Tu email (opcional)
                        </label>
                        <input
                            type="email"
                            name="user_email"
                            value={formData.user_email}
                            onChange={handleChange}
                            placeholder="tu@email.com"
                            className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white placeholder-slate-500 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                        />
                        <p className="mt-1 text-xs text-slate-500">
                            Solo si deseas que podamos escribirte para darte seguimiento
                        </p>
                    </div>

                    <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4">
                        <p className="flex items-center gap-2 text-sm text-slate-300">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Incluiremos algunos datos técnicos básicos de tu dispositivo para entender mejor el contexto
                        </p>
                    </div>

                    {submitStatus === 'success' && (
                        <div className="flex items-center gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4">
                            <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            <span className="text-green-200 font-semibold">Recibimos tu reporte correctamente. Gracias por ayudarnos a mejorar.</span>
                        </div>
                    )}

                    {submitStatus === 'error' && (
                        <div className="flex items-center gap-2 rounded-2xl border border-rose-400/20 bg-rose-500/10 p-4">
                            <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            <span className="text-red-200">No pudimos enviar tu reporte en este momento. Inténtalo nuevamente en unos instantes.</span>
                        </div>
                    )}

                    <div className="flex gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 rounded-2xl border border-white/10 bg-slate-800 px-6 py-3 font-semibold text-white transition hover:bg-slate-700"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="flex-1 rounded-2xl bg-[linear-gradient(135deg,#f59e0b,#ea580c)] px-6 py-3 font-bold text-white shadow-[0_20px_50px_-24px_rgba(249,115,22,0.9)] transition hover:scale-[1.01] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 disabled:transform-none"
                        >
                            {isSubmitting ? (
                                <span className="flex items-center justify-center gap-2">
                                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    Enviando...
                                </span>
                            ) : (
                                'Enviar reporte'
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
