import { useEffect, useState } from 'react';
import api from '../api/axios';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';

export default function UnblockAccount() {
    const [step, setStep] = useState(1);
    const [gmail, setGmail] = useState('');
    const [code, setCode] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();

    const preloadedEmail = location.state?.gmail || location.state?.email || '';

    useEffect(() => {
        if (preloadedEmail) {
            setGmail(preloadedEmail);
        }
    }, [preloadedEmail]);

    const handleStep1 = async (e) => {
        e.preventDefault();
        setError('');
        
        if (!gmail.trim()) {
            setError('Ingresa tu correo para continuar.');
            return;
        }

        setLoading(true);
        try {
            await api.post('/resend-code', { gmail });
            setStep(2);
        } catch (err) {
            const data = err?.response?.data;
            const msg = (typeof data === 'string')
                ? data
                : data?.message || data?.error || 'No pudimos enviar el codigo.';
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    const handleStep2 = (e) => {
        e.preventDefault();
        setError('');
        
        if (!code.trim()) {
            setError('Ingresa el codigo que enviamos a tu correo.');
            return;
        }
        setStep(3);
    };

    const handleStep3 = async (e) => {
        e.preventDefault();
        setError('');
        
        if (!newPassword.trim() || !confirmPassword.trim()) {
            setError('Completa ambos campos.');
            return;
        }

        if (newPassword !== confirmPassword) {
            setError('Las contrasenas no coinciden');
            return;
        }

        if (newPassword.length < 8) {
            setError('La contrasena debe tener minimo 8 caracteres');
            return;
        }

        if (!/[0-9]/.test(newPassword)) {
            setError('La contrasena debe contener algun numero');
            return;
        }

        if (!/[A-Z]/.test(newPassword)) {
            setError('La contrasena debe contener alguna mayuscula');
            return;
        }

        if (!/[!@#$%^&*(),.?":{}|<>]/.test(newPassword)) {
            setError('La contrasena debe contener algun caracter especial');
            return;
        }

        setLoading(true);
        try {
            await api.post('/unlock-account', { email: gmail, code, password: newPassword });
            alert('Tu cuenta ya esta disponible. Inicia sesion con tu nueva contrasena.');
            navigate('/login');
        } catch (err) {
            const data = err?.response?.data;
            const msg = (typeof data === 'string')
                ? data
                : data?.message || data?.error || 'No pudimos recuperar tu acceso.';
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    const titles = ['Desbloquear cuenta', 'Verifica el codigo', 'Nueva contrasena'];
    const subtitles = [
        'Protegimos tu acceso temporalmente. Te ayudamos a recuperarlo.',
        'Confirma el codigo que enviamos a tu correo',
        'Define una nueva contrasena para volver a entrar'
    ];

    return (
        <AuthLayout
            title={titles[step - 1]}
            subtitle={subtitles[step - 1]}
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

            {step === 1 && (
                <form onSubmit={handleStep1} className="space-y-5">
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-2">Email</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                            </div>
                            <input
                                type="email"
                                value={gmail}
                                onChange={(e) => setGmail(e.target.value)}
                                className="w-full rounded-xl border border-white/[0.06] bg-slate-900/50 p-3 pl-10 text-white placeholder-slate-500 transition-all focus:border-rose-500/30 focus:outline-none focus:ring-1 focus:ring-rose-500/15"
                                placeholder="tu@email.com"
                            />
                        </div>
                        <p className="text-slate-500 text-xs mt-2 ml-1">
                            Se enviara un codigo de desbloqueo a este email
                        </p>
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full rounded-xl bg-gradient-to-r from-rose-500 to-red-600 py-3 font-semibold text-white shadow-lg shadow-rose-500/10 transition-all duration-200 hover:shadow-rose-500/20 hover:brightness-105 active:scale-[0.98] disabled:opacity-50"
                    >
                        {loading ? 'Enviando...' : 'Enviar codigo'}
                    </button>
                </form>
            )}

            {step === 2 && (
                <form onSubmit={handleStep2} className="space-y-5">
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-2">Codigo de Desbloqueo</label>
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
                                className="w-full rounded-xl border border-white/[0.06] bg-slate-900/50 p-3 pl-10 text-center text-lg tracking-widest text-white placeholder-slate-500 transition-all focus:border-rose-500/30 focus:outline-none focus:ring-1 focus:ring-rose-500/15"
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
                        className="w-full rounded-xl bg-gradient-to-r from-rose-500 to-red-600 py-3 font-semibold text-white shadow-lg shadow-rose-500/10 transition-all duration-200 hover:shadow-rose-500/20 hover:brightness-105 active:scale-[0.98]"
                    >
                        Verificar codigo
                    </button>
                    <button
                        type="button"
                        onClick={() => setStep(1)}
                        className="w-full rounded-xl bg-slate-800/60 border border-white/[0.06] py-3 font-medium text-slate-300 transition-all duration-200 hover:bg-slate-800"
                    >
                        Volver
                    </button>
                </form>
            )}

            {step === 3 && (
                <form onSubmit={handleStep3} className="space-y-5">
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-2">Nueva Contrasena</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                            </div>
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                className="w-full rounded-xl border border-white/[0.06] bg-slate-900/50 p-3 pl-10 pr-12 tracking-wide text-white placeholder-slate-500 transition-all focus:border-rose-500/30 focus:outline-none focus:ring-1 focus:ring-rose-500/15"
                                placeholder="Minimo 8 caracteres"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword((v) => !v)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-300 font-medium transition-colors"
                            >
                                {showPassword ? 'Ocultar' : 'Ver'}
                            </button>
                        </div>
                        <p className="text-slate-500 text-xs mt-1.5 ml-1">
                            Debe incluir: 8+ caracteres, mayuscula, numero y caracter especial
                        </p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-2">Confirmar Contrasena</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                </svg>
                            </div>
                            <input
                                type={showConfirm ? 'text' : 'password'}
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="w-full rounded-xl border border-white/[0.06] bg-slate-900/50 p-3 pl-10 pr-12 tracking-wide text-white placeholder-slate-500 transition-all focus:border-rose-500/30 focus:outline-none focus:ring-1 focus:ring-rose-500/15"
                                placeholder="Confirma tu contrasena"
                            />
                            <button
                                type="button"
                                onClick={() => setShowConfirm((v) => !v)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-300 font-medium transition-colors"
                            >
                                {showConfirm ? 'Ocultar' : 'Ver'}
                            </button>
                        </div>
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full rounded-xl bg-gradient-to-r from-rose-500 to-red-600 py-3 font-semibold text-white shadow-lg shadow-rose-500/10 transition-all duration-200 hover:shadow-rose-500/20 hover:brightness-105 active:scale-[0.98] disabled:opacity-50"
                    >
                        {loading ? 'Procesando...' : 'Desbloquear cuenta'}
                    </button>
                    <button
                        type="button"
                        onClick={() => setStep(2)}
                        className="w-full rounded-xl bg-slate-800/60 border border-white/[0.06] py-3 font-medium text-slate-300 transition-all duration-200 hover:bg-slate-800"
                    >
                        Volver
                    </button>
                </form>
            )}
        </AuthLayout>
    );
}
