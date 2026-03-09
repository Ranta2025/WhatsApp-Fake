import { useState } from 'react';
import api from '../api/axios';
import { useNavigate, Link } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';

export default function RecoverPassword() {
    const [step, setStep] = useState(1);
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleStep1 = async (e) => {
        e.preventDefault();
        setError('');
        
        if (!email.trim()) {
            setError('Ingresa tu correo para continuar con la recuperación.');
            return;
        }

        setLoading(true);
        try {
            const response = await api.post('/forgot-password-send', {
                email: email
            });
            setStep(2);
        } catch (err) {
            const data = err?.response?.data;
            const msg = (typeof data === 'string')
                ? data
                : data?.message || data?.error || 'No encontramos una cuenta asociada a ese correo.';
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    const handleStep2 = (e) => {
        e.preventDefault();
        setError('');
        
        if (!code.trim()) {
            setError('Ingresa el código que enviamos a tu correo.');
            return;
        }
        setStep(3);
    };

    const handleStep3 = async (e) => {
        e.preventDefault();
        setError('');
        
        if (!newPassword.trim() || !confirmPassword.trim()) {
            setError('Completa ambos campos para crear tu nueva contraseña.');
            return;
        }

        if (newPassword !== confirmPassword) {
            setError('Las contraseñas no coinciden');
            return;
        }

        if (newPassword.length < 8) {
            setError('La contraseña debe tener mínimo 8 caracteres');
            return;
        }

        // Validaciones de contraseña
        if (!/[0-9]/.test(newPassword)) {
            setError('La contraseña debe contener algún número');
            return;
        }

        if (!/[A-Z]/.test(newPassword)) {
            setError('La contraseña debe contener alguna mayúscula');
            return;
        }

        if (!/[!@#$%^&*(),.?":{}|<>]/.test(newPassword)) {
            setError('La contraseña debe contener algún caracter especial');
            return;
        }

        setLoading(true);
        try {
            await api.post('/forgot-password-change', {
                email: email,
                code: code,
                password: newPassword
            });
            alert('Tu contraseña fue actualizada correctamente. Ya puedes volver a entrar.');
            navigate('/login');
        } catch (err) {
            const data = err?.response?.data;
            const msg = (typeof data === 'string')
                ? data
                : data?.message || data?.error || 'No pudimos actualizar tu contraseña en este momento.';
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout
            title={
                step === 1
                    ? 'Recuperar contraseña'
                    : step === 2
                    ? 'Verifica el código'
                    : 'Nueva contraseña'
            }
            subtitle={
                step === 1
                    ? 'Te ayudamos a recuperar tu acceso en pocos pasos'
                    : step === 2
                    ? 'Confirma el código que enviamos a tu correo'
                    : 'Crea una contraseña nueva y vuelve a entrar con tranquilidad'
            }
            footer={(
                <span>
                    ¿Recuerdas tu contraseña? <Link to="/login" className="text-indigo-300 hover:text-white">Inicia sesión</Link>
                </span>
            )}
        >
            {error && <div className="mb-5 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-center text-sm text-rose-200">{error}</div>}

            {/* STEP 1: Email */}
            {step === 1 && (
                <form onSubmit={handleStep1} className="space-y-4">
                    <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-400 sm:grid-cols-3">
                        <div className="rounded-xl bg-slate-950/60 px-3 py-2.5">
                            <div className="uppercase tracking-[0.2em] text-sky-300/80">Recuperacion</div>
                            <div className="mt-1 text-sm font-semibold text-slate-100">Vuelve a entrar</div>
                        </div>
                        <div className="rounded-xl bg-slate-950/60 px-3 py-2.5">
                            <div className="uppercase tracking-[0.2em] text-amber-300/80">Confirmación</div>
                            <div className="mt-1 text-sm font-semibold text-slate-100">Código por correo</div>
                        </div>
                        <div className="rounded-xl bg-slate-950/60 px-3 py-2.5">
                            <div className="uppercase tracking-[0.2em] text-emerald-300/80">Resultado</div>
                            <div className="mt-1 text-sm font-semibold text-slate-100">Cuenta recuperada</div>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1.5">Email</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                            </div>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full rounded-2xl border border-white/10 bg-slate-950/70 p-3.5 pl-10 text-white placeholder-slate-500 transition-all duration-200 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
                                placeholder="tu@email.com"
                            />
                        </div>
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="mt-6 w-full rounded-2xl bg-[linear-gradient(135deg,#0ea5e9,#2563eb)] py-3.5 font-bold text-white shadow-[0_20px_50px_-20px_rgba(14,165,233,0.8)] transition-all duration-200 hover:scale-[1.01] hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
                    >
                        {loading ? 'Enviando...' : 'Enviar código'}
                    </button>
                </form>
            )}

            {/* STEP 2: Code */}
            {step === 2 && (
                <form onSubmit={handleStep2} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1.5">Código de Recuperación</label>
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
                                className="w-full rounded-2xl border border-white/10 bg-slate-950/70 p-3.5 pl-10 text-center text-lg tracking-widest text-white placeholder-slate-500 transition-all duration-200 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
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
                        className="mt-6 w-full rounded-2xl bg-[linear-gradient(135deg,#0ea5e9,#2563eb)] py-3.5 font-bold text-white shadow-[0_20px_50px_-20px_rgba(14,165,233,0.8)] transition-all duration-200 hover:scale-[1.01] hover:brightness-110 active:scale-[0.98]"
                    >
                        Verificar código
                    </button>
                    <button
                        type="button"
                        onClick={() => setStep(1)}
                        className="w-full rounded-2xl bg-slate-800/80 py-3.5 font-bold text-slate-300 transition-all duration-200 hover:bg-slate-700"
                    >
                        Volver
                    </button>
                </form>
            )}

            {/* STEP 3: New Password */}
            {step === 3 && (
                <form onSubmit={handleStep3} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1.5">Nueva Contraseña</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                            </div>
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                className="w-full rounded-2xl border border-white/10 bg-slate-950/70 p-3.5 pl-10 pr-12 tracking-wide text-white placeholder-slate-500 transition-all duration-200 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                                placeholder="Mínimo 8 caracteres"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword((v) => !v)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-sm font-medium transition-colors"
                            >
                                {showPassword ? 'Ocultar' : 'Ver'}
                            </button>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1.5">Confirmar Contraseña</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                </svg>
                            </div>
                            <input
                                type={showConfirm ? 'text' : 'password'}
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="w-full rounded-2xl border border-white/10 bg-slate-950/70 p-3.5 pl-10 pr-12 tracking-wide text-white placeholder-slate-500 transition-all duration-200 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                                placeholder="Confirma tu contraseña"
                            />
                            <button
                                type="button"
                                onClick={() => setShowConfirm((v) => !v)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-sm font-medium transition-colors"
                            >
                                {showConfirm ? 'Ocultar' : 'Ver'}
                            </button>
                        </div>
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="mt-6 w-full rounded-2xl bg-[linear-gradient(135deg,#f59e0b,#ea580c)] py-3.5 font-bold text-white shadow-[0_20px_50px_-20px_rgba(249,115,22,0.8)] transition-all duration-200 hover:scale-[1.01] hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
                    >
                        {loading ? 'Cambiando...' : 'Cambiar contraseña'}
                    </button>
                    <button
                        type="button"
                        onClick={() => setStep(2)}
                        className="w-full rounded-2xl bg-slate-800/80 py-3.5 font-bold text-slate-300 transition-all duration-200 hover:bg-slate-700"
                    >
                        Volver
                    </button>
                </form>
            )}
        </AuthLayout>
    );
}
