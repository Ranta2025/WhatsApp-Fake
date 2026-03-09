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
            await api.post('/activate-cuenta', {
                username: username
            });
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
            subtitle="Confirma tu identidad y recibe tu código para volver a entrar"
            footer={(
                <span>
                    ¿Necesitas ayuda? <Link to="/login" className="text-indigo-300 hover:text-white">Volver a iniciar sesión</Link>
                </span>
            )}
        >
            {error && <div className="mb-5 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-center text-sm text-rose-200">{error}</div>}
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-400 sm:grid-cols-3">
                    <div className="rounded-xl bg-slate-950/60 px-3 py-2.5">
                        <div className="uppercase tracking-[0.2em] text-amber-300/80">Cuenta</div>
                        <div className="mt-1 text-sm font-semibold text-slate-100">Vuelve a entrar</div>
                    </div>
                    <div className="rounded-xl bg-slate-950/60 px-3 py-2.5">
                        <div className="uppercase tracking-[0.2em] text-sky-300/80">Confirmación</div>
                        <div className="mt-1 text-sm font-semibold text-slate-100">Código al instante</div>
                    </div>
                    <div className="rounded-xl bg-slate-950/60 px-3 py-2.5">
                        <div className="uppercase tracking-[0.2em] text-emerald-300/80">Continuidad</div>
                        <div className="mt-1 text-sm font-semibold text-slate-100">Recupera tu acceso</div>
                    </div>
                </div>
                <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-300">Username</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                            <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                        </div>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full rounded-2xl border border-white/10 bg-slate-950/70 p-3.5 pl-10 text-white placeholder-slate-500 transition-all duration-200 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                            placeholder="Tu username"
                        />
                    </div>
                </div>
                <button
                    type="submit"
                    disabled={loading}
                    className="mt-6 w-full rounded-2xl bg-[linear-gradient(135deg,#f59e0b,#ea580c)] py-3.5 font-bold text-white shadow-[0_20px_50px_-20px_rgba(249,115,22,0.8)] transition-all duration-200 hover:scale-[1.01] hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
                >
                    {loading ? 'Enviando...' : 'Enviar código'}
                </button>
            </form>
        </AuthLayout>
    );
}