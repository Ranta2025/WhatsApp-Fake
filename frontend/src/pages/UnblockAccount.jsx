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

    // Si viene desde el login con email pre-cargado
    const preloadedEmail = location.state?.gmail || location.state?.email || '';

    useEffect(() => {
        if (preloadedEmail) {
            setGmail(preloadedEmail);
        }
    }, [preloadedEmail]);

    // STEP 1: Solicitar código de desbloqueo
    const handleStep1 = async (e) => {
        e.preventDefault();
        setError('');
        
        if (!gmail.trim()) {
            setError('Por favor ingresa tu email');
            return;
        }

        setLoading(true);
        try {
            const response = await api.post('/resend-code', {
                gmail: gmail
            });
            setStep(2);
        } catch (err) {
            const data = err?.response?.data;
            const msg = (typeof data === 'string')
                ? data
                : data?.message || data?.error || 'Email no encontrado o error al enviar código';
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    // STEP 2: Verificar código
    const handleStep2 = (e) => {
        e.preventDefault();
        setError('');
        
        if (!code.trim()) {
            setError('Por favor ingresa el código');
            return;
        }
        setStep(3);
    };

    // STEP 3: Cambiar contraseña y desbloquear
    const handleStep3 = async (e) => {
        e.preventDefault();
        setError('');
        
        if (!newPassword.trim() || !confirmPassword.trim()) {
            setError('Por favor completa todos los campos');
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
            // Operación atómica: desbloquear + cambiar contraseña en una sola llamada
            await api.post('/unlock-account', {
                email: gmail,
                code: code,
                password: newPassword
            });

            alert('¡Cuenta desbloqueada exitosamente! Ya puedes iniciar sesión con tu nueva contraseña.');
            navigate('/login');
        } catch (err) {
            const data = err?.response?.data;
            const msg = (typeof data === 'string')
                ? data
                : data?.message || data?.error || 'Error al desbloquear cuenta';
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout
            title={
                step === 1
                    ? 'Desbloquear cuenta'
                    : step === 2
                    ? 'Verifica el código'
                    : 'Nueva contraseña'
            }
            subtitle={
                step === 1
                    ? 'Tu cuenta fue bloqueada por intentos fallidos. Ingresa tu email para recibir un código de desbloqueo.'
                    : step === 2
                    ? 'Ingresa el código enviado a tu email'
                    : 'Crea una nueva contraseña para tu cuenta'
            }
            footer={(
                <span>
                    ¿Necesitas ayuda? <Link to="/login" className="text-indigo-300 hover:text-white">Volver al login</Link>
                </span>
            )}
        >
            {error && <p className="text-red-400 text-sm mb-4 text-center">{error}</p>}

            {/* STEP 1: Email */}
            {step === 1 && (
                <form onSubmit={handleStep1} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-indigo-100 mb-1.5">Email</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                <svg className="w-5 h-5 text-indigo-300/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                            </div>
                            <input
                                type="email"
                                value={gmail}
                                onChange={(e) => setGmail(e.target.value)}
                                className="w-full pl-10 p-3.5 rounded-xl bg-white/10 border border-white/20 text-white placeholder-indigo-200/50 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent focus:bg-white/20 transition-all duration-200"
                                placeholder="tu@email.com"
                            />
                        </div>
                        <p className="text-indigo-300/80 text-xs mt-2 ml-1">
                            Se enviará un código de desbloqueo a este email
                        </p>
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full mt-6 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-indigo-500/30 transform transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                    >
                        {loading ? 'Enviando...' : 'Enviar código'}
                    </button>
                </form>
            )}

            {/* STEP 2: Code */}
            {step === 2 && (
                <form onSubmit={handleStep2} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-indigo-100 mb-1.5">Código de Desbloqueo</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                <svg className="w-5 h-5 text-indigo-300/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                                </svg>
                            </div>
                            <input
                                type="text"
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                                className="w-full pl-10 p-3.5 rounded-xl bg-white/10 border border-white/20 text-white placeholder-indigo-200/50 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent focus:bg-white/20 transition-all duration-200 text-center tracking-widest text-lg"
                                placeholder="000000"
                                maxLength="20"
                            />
                        </div>
                        <p className="text-indigo-300/80 text-xs mt-2 ml-1">
                            Revisa tu email para encontrar el código
                        </p>
                    </div>
                    <button
                        type="submit"
                        className="w-full mt-6 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-indigo-500/30 transform transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                    >
                        Verificar código
                    </button>
                    <button
                        type="button"
                        onClick={() => setStep(1)}
                        className="w-full bg-white/5 hover:bg-white/10 text-indigo-300 font-bold py-3.5 rounded-xl transition-all duration-200"
                    >
                        Volver
                    </button>
                </form>
            )}

            {/* STEP 3: New Password */}
            {step === 3 && (
                <form onSubmit={handleStep3} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-indigo-100 mb-1.5">Nueva Contraseña</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                <svg className="w-5 h-5 text-indigo-300/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                            </div>
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                className="w-full pl-10 p-3.5 pr-12 rounded-xl bg-white/10 border border-white/20 text-white placeholder-indigo-200/50 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent focus:bg-white/20 transition-all duration-200 tracking-wide"
                                placeholder="Mínimo 8 caracteres"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword((v) => !v)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-indigo-200 hover:text-white text-sm font-medium transition-colors"
                            >
                                {showPassword ? 'Ocultar' : 'Ver'}
                            </button>
                        </div>
                        <p className="text-indigo-300/80 text-xs mt-1.5 ml-1">
                            Debe incluir: 8+ caracteres, mayúscula, número y caracter especial
                        </p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-indigo-100 mb-1.5">Confirmar Contraseña</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                <svg className="w-5 h-5 text-indigo-300/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                </svg>
                            </div>
                            <input
                                type={showConfirm ? 'text' : 'password'}
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="w-full pl-10 p-3.5 pr-12 rounded-xl bg-white/10 border border-white/20 text-white placeholder-indigo-200/50 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent focus:bg-white/20 transition-all duration-200 tracking-wide"
                                placeholder="Confirma tu contraseña"
                            />
                            <button
                                type="button"
                                onClick={() => setShowConfirm((v) => !v)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-indigo-200 hover:text-white text-sm font-medium transition-colors"
                            >
                                {showConfirm ? 'Ocultar' : 'Ver'}
                            </button>
                        </div>
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full mt-6 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-indigo-500/30 transform transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                    >
                        {loading ? 'Procesando...' : 'Desbloquear cuenta'}
                    </button>
                    <button
                        type="button"
                        onClick={() => setStep(2)}
                        className="w-full bg-white/5 hover:bg-white/10 text-indigo-300 font-bold py-3.5 rounded-xl transition-all duration-200"
                    >
                        Volver
                    </button>
                </form>
            )}
        </AuthLayout>
    );
}
