import { useState } from 'react';
import api from '../api/axios';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AuthLayout from '../components/AuthLayout';

export default function ActivateAccount() {
    const [code, setCode] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [resendLoading, setResendLoading] = useState(false);
    const [resendSuccess, setResendSuccess] = useState(false);
    const [isBloqueado, setIsBloqueado] = useState(false);
    const navigate = useNavigate();
    const { setUser } = useAuth();
    const location = useLocation();
    const username = location.state?.username || '';
    const gmail = location.state?.gmail || '';

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        
        if (isBloqueado) {
            setError('Tu acceso está protegido temporalmente. Si lo necesitas, podemos ayudarte a recuperarlo.');
            return;
        }

        if (!code.trim()) {
            setError('Ingresa el código para completar tu acceso.');
            return;
        }

        if (!username) {
            setError('No pudimos identificar tu cuenta. Intenta iniciar el proceso nuevamente.');
            return;
        }

        setLoading(true);
        try {
            const response = await api.post('/activate', {
                username: username,
                code: code
            });
            // Establecer el usuario en el contexto ANTES de navegar
            setUser({ username: username });
            alert('Tu cuenta ya está lista. Bienvenido.');
            navigate('/dashboard', { replace: true });
        } catch (err) {
            const data = err?.response?.data;
            const msg = (typeof data === 'string')
                ? data
                : data?.message || data?.error || 'No pudimos confirmar el código. Revisa la información e inténtalo nuevamente.';
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    const handleResendCode = async () => {
        setError('');
        setResendSuccess(false);

        if (isBloqueado) {
            setError('Tu acceso sigue protegido temporalmente, por ahora no es posible enviar un nuevo código.');
            return;
        }

        if (!username) {
            setError('No pudimos identificar tu cuenta. Intenta iniciar el proceso nuevamente.');
            return;
        }

        setResendLoading(true);
        try {
            await api.post('/activate-cuenta', {
                username: username
            });
            setResendSuccess(true);
            setCode('');
            setTimeout(() => setResendSuccess(false), 5000);
        } catch (err) {
            const data = err?.response?.data;
            const msg = (typeof data === 'string')
                ? data
                : data?.message || data?.error || 'No pudimos enviar un nuevo código en este momento.';
            setError(msg);
            // Si el error es "usuario bloqueado", marcar como bloqueado
            if (msg.toLowerCase().includes('bloqueado')) {
                setIsBloqueado(true);
            }
        } finally {
            setResendLoading(false);
        }
    };

    return (
        <AuthLayout
            title={isBloqueado ? "Cuenta Bloqueada" : "Verifica tu cuenta"}
            subtitle={isBloqueado ? "Tu acceso quedó protegido temporalmente" : "Ingresa el código que enviamos para completar tu acceso"}
            footer={(
                <span>
                    ¿Necesitas ayuda? <Link to="/login" className="text-indigo-300 hover:text-white">Volver a iniciar sesión</Link>
                </span>
            )}
        >
            {error && <div className="mb-5 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-center text-sm text-rose-200">{error}</div>}
            {resendSuccess && <div className="mb-5 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-center text-sm text-emerald-200">✓ Te enviamos un nuevo código a tu correo</div>}
            
            {isBloqueado ? (
                <div className="text-center py-8">
                    <div className="mb-5 rounded-3xl border border-rose-400/20 bg-rose-500/10 p-5 text-left">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-rose-300/80">Estado</div>
                        <p className="mt-2 text-sm leading-6 text-rose-100">Detectamos varios intentos fallidos y protegimos tu cuenta temporalmente. Si necesitas ayuda, nuestro equipo puede orientarte.</p>
                    </div>
                    <Link to="/login" className="text-amber-300 hover:text-amber-200 underline">
                        Volver al inicio
                    </Link>
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-400 sm:grid-cols-3">
                        <div className="rounded-xl bg-slate-950/60 px-3 py-2.5">
                            <div className="uppercase tracking-[0.2em] text-amber-300/80">Cuenta</div>
                            <div className="mt-1 text-sm font-semibold text-slate-100">Último paso</div>
                        </div>
                        <div className="rounded-xl bg-slate-950/60 px-3 py-2.5">
                            <div className="uppercase tracking-[0.2em] text-sky-300/80">Cuenta</div>
                            <div className="mt-1 truncate text-sm font-semibold text-slate-100">{username || 'Pendiente'}</div>
                        </div>
                        <div className="rounded-xl bg-slate-950/60 px-3 py-2.5">
                            <div className="uppercase tracking-[0.2em] text-emerald-300/80">Confianza</div>
                            <div className="mt-1 text-sm font-semibold text-slate-100">Acceso confirmado</div>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1.5">Código de Activación</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                                </svg>
                            </div>
                            <input
                                type="text"
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                                className="w-full rounded-2xl border border-white/10 bg-slate-950/70 p-3.5 pl-10 text-center text-lg tracking-widest text-white placeholder-slate-500 transition-all duration-200 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                                placeholder="000000"
                                maxLength="20"
                            />
                        </div>
                        <p className="text-slate-500 text-xs mt-2 ml-1">
                            Revisa tu email para encontrar el código
                        </p>
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="mt-6 w-full rounded-2xl bg-[linear-gradient(135deg,#f59e0b,#ea580c)] py-3.5 font-bold text-white shadow-[0_20px_50px_-20px_rgba(249,115,22,0.8)] transition-all duration-200 hover:scale-[1.01] hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
                    >
                        {loading ? 'Verificando...' : 'Activar cuenta'}
                    </button>
                    <button
                        type="button"
                        onClick={handleResendCode}
                        disabled={resendLoading}
                        className="w-full rounded-2xl bg-slate-800/80 py-3.5 font-bold text-slate-300 transition-all duration-200 hover:bg-slate-700 disabled:opacity-50"
                    >
                        {resendLoading ? 'Reenviando...' : 'No recibí el código'}
                    </button>
                </form>
            )}
        </AuthLayout>
    );
}
