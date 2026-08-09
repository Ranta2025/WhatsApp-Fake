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

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        
        if (isBloqueado) {
            setError('Tu acceso esta protegido temporalmente.');
            return;
        }

        if (!code.trim()) {
            setError('Ingresa el codigo para completar tu acceso.');
            return;
        }

        if (!username) {
            setError('No pudimos identificar tu cuenta. Intenta iniciar el proceso nuevamente.');
            return;
        }

        setLoading(true);
        try {
            await api.post('/activate', { username, code });
            setUser({ username });
            alert('Tu cuenta ya esta lista. Bienvenido.');
            navigate('/dashboard', { replace: true });
        } catch (err) {
            const data = err?.response?.data;
            const msg = (typeof data === 'string')
                ? data
                : data?.message || data?.error || 'No pudimos confirmar el codigo.';
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    const handleResendCode = async () => {
        setError('');
        setResendSuccess(false);

        if (isBloqueado) {
            setError('Tu acceso sigue protegido temporalmente.');
            return;
        }

        if (!username) {
            setError('No pudimos identificar tu cuenta.');
            return;
        }

        setResendLoading(true);
        try {
            await api.post('/activate-cuenta', { username });
            setResendSuccess(true);
            setCode('');
            setTimeout(() => setResendSuccess(false), 5000);
        } catch (err) {
            const data = err?.response?.data;
            const msg = (typeof data === 'string')
                ? data
                : data?.message || data?.error || 'No pudimos enviar un nuevo codigo.';
            setError(msg);
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
            subtitle={isBloqueado ? "Tu acceso quedo protegido temporalmente" : "Ingresa el codigo que enviamos a tu correo"}
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
            {resendSuccess && (
                <div className="mb-5 rounded-xl bg-emerald-500/10 border border-emerald-500/15 px-4 py-3 text-center text-sm text-emerald-300">
                    Te enviamos un nuevo codigo a tu correo
                </div>
            )}
            
            {isBloqueado ? (
                <div className="text-center py-6">
                    <div className="mb-5 rounded-xl bg-red-500/10 border border-red-500/15 p-4 text-left">
                        <p className="text-sm leading-relaxed text-red-200">
                            Detectamos varios intentos fallidos y protegimos tu cuenta temporalmente.
                        </p>
                    </div>
                    <Link to="/login" className="text-sky-400 hover:text-sky-300 font-medium transition-colors">
                        Volver al inicio
                    </Link>
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-2">Codigo de Activacion</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                                </svg>
                            </div>
                            <input
                                type="text"
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                                className="w-full rounded-xl border border-white/[0.06] bg-slate-900/50 p-3 pl-10 text-center text-lg tracking-widest text-white placeholder-slate-500 transition-all focus:border-amber-500/30 focus:outline-none focus:ring-1 focus:ring-amber-500/15"
                                placeholder="000000"
                                maxLength="20"
                            />
                        </div>
                        <p className="text-slate-500 text-xs mt-2 ml-1">
                            Revisa tu email para encontrar el codigo
                        </p>
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 py-3 font-semibold text-white shadow-lg shadow-amber-500/10 transition-all duration-200 hover:shadow-amber-500/20 hover:brightness-105 active:scale-[0.98] disabled:opacity-50"
                    >
                        {loading ? 'Verificando...' : 'Activar cuenta'}
                    </button>
                    <button
                        type="button"
                        onClick={handleResendCode}
                        disabled={resendLoading}
                        className="w-full rounded-xl bg-slate-800/60 border border-white/[0.06] py-3 font-medium text-slate-300 transition-all duration-200 hover:bg-slate-800 disabled:opacity-50"
                    >
                        {resendLoading ? 'Reenviando...' : 'No recibi el codigo'}
                    </button>
                </form>
            )}
        </AuthLayout>
    );
}
