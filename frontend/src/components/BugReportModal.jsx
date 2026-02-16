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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="bg-gradient-to-br from-gray-900 to-purple-900 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-purple-500/30">
                {/* Header */}
                <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-4 flex justify-between items-center rounded-t-2xl">
                    <div className="flex items-center gap-2">
                        <span className="text-2xl">🐛</span>
                        <h2 className="text-2xl font-bold text-white">Reportar un Bug</h2>
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

                {/* Body */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <p className="text-indigo-300 text-sm">
                        ¡Gracias por ayudarnos a mejorar! Tu reporte será enviado directamente a nuestro equipo de desarrollo.
                    </p>

                    {/* Título */}
                    <div>
                        <label className="block text-white font-semibold mb-2">
                            Título del Bug <span className="text-red-400">*</span>
                        </label>
                        <input
                            type="text"
                            name="title"
                            value={formData.title}
                            onChange={handleChange}
                            required
                            placeholder="Ej: El botón de enviar no funciona"
                            className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-indigo-300 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/50"
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
                            className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-indigo-300 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/50"
                        />
                    </div>

                    {/* Pasos para reproducir */}
                    <div>
                        <label className="block text-white font-semibold mb-2">
                            Pasos para Reproducir
                        </label>
                        <textarea
                            name="steps"
                            value={formData.steps}
                            onChange={handleChange}
                            rows="3"
                            placeholder="1. Ir a la página de login&#10;2. Ingresar credenciales&#10;3. Hacer clic en enviar..."
                            className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-indigo-300 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/50"
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
                                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-indigo-300 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/50"
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
                                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-indigo-300 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/50"
                            />
                        </div>
                    </div>

                    {/* Email del usuario */}
                    <div>
                        <label className="block text-white font-semibold mb-2">
                            Tu Email (opcional)
                        </label>
                        <input
                            type="email"
                            name="user_email"
                            value={formData.user_email}
                            onChange={handleChange}
                            placeholder="tu@email.com"
                            className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-indigo-300 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/50"
                        />
                        <p className="text-indigo-300 text-xs mt-1">
                            Por si necesitamos contactarte para más detalles
                        </p>
                    </div>

                    {/* Información del sistema */}
                    <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                        <p className="text-indigo-300 text-sm flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            La información de tu navegador y sistema será incluida automáticamente
                        </p>
                    </div>

                    {/* Mensaje de estado */}
                    {submitStatus === 'success' && (
                        <div className="bg-green-500/20 border border-green-500 rounded-lg p-4 flex items-center gap-2">
                            <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            <span className="text-green-200 font-semibold">¡Reporte enviado exitosamente! Gracias por tu ayuda 🎉</span>
                        </div>
                    )}

                    {submitStatus === 'error' && (
                        <div className="bg-red-500/20 border border-red-500 rounded-lg p-4 flex items-center gap-2">
                            <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            <span className="text-red-200">Error al enviar el reporte. Por favor, intenta de nuevo.</span>
                        </div>
                    )}

                    {/* Botones */}
                    <div className="flex gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-6 py-3 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-lg transition border border-white/20"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold rounded-lg transition transform hover:scale-105 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
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
                                'Enviar Reporte'
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
