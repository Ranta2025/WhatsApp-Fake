import { useState } from 'react';
import api from '../api/axios';
import { useNavigate, Link } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';

export default function ActivateExisting() {
    const [username, setUsername] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        
        if (!username.trim()) {
            setError('Por favor ingresa tu username');
            return;
        }

        setLoading(true);
        try {
            await api.post('/activate-cuenta', { username });
            navigate('/activate', { state: { username } });
        } catch (err) {
            const data = err?.response?.data;
            const msg = (typeof data === 'string')
                ? data
                : data?.message || data?.error || 'Username no encontrado o cuenta ya activa';
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout
            title="Activar cuenta"
            subtitle="Confirma tu identidad y recibe tu codigo para volver a entrar"
            footer={(
                <span>
                    Necesitas ayuda? <Link to="/login" className="text-sky-400 hover:text-sky-300 font-medium">Volver al inicio</Link>
                </span>
            )}
        >
            {error && (
                <div className="mb-5 rounded-xl bg-red-500/10 border border-red-500/15 px-4 py-3 text-center text-sm text-red-300">
                    {error}
                </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">Username</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                            <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                        </div>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full rounded-xl border border-white/[0.06] bg-slate-900/50 p-3 pl-10 text-white placeholder-slate-500 transition-all focus:border-amber-500/30 focus:outline-none focus:ring-1 focus:ring-amber-500/15"
                            placeholder="Tu username"
                        />
                    </div>
                </div>
                <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 py-3 font-semibold text-white shadow-lg shadow-amber-500/10 transition-all duration-200 hover:shadow-amber-500/20 hover:brightness-105 active:scale-[0.98] disabled:opacity-50"
                >
                    {loading ? 'Enviando...' : 'Enviar codigo'}
                </button>
            </form>
        </AuthLayout>
    );
}
