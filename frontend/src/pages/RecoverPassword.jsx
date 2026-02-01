import { useState } from 'react';
import api from '../api/axios';
import { useNavigate, Link } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';

export default function RecoverPassword() {
    const [username, setUsername] = useState('');
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
        
        if (!username.trim()) {
            setError('Por favor ingresa tu username');
            return;
        }

        setLoading(true);
        try {
            const response = await api.post('/activate-cuenta', {
                username: username
            });
            setStep(2);
        } catch (err) {
            const data = err?.response?.data;
            const msg = (typeof data === 'string')
                ? data
                : data?.message || data?.error || 'Username no encontrado';
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    const handleStep2 = (e) => {
        e.preventDefault();
        setError('');
        
        if (!code.trim()) {
            setError('Por favor ingresa el código');
            return;
        }
        setStep(3);
    };

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

        setLoading(true);
        try {
            await api.post('/activate', {
                username: username,
                code: code,
                newPassword: newPassword
            });
            navigate('/');
        } catch (err) {
            const data = err?.response?.data;
            const msg = (typeof data === 'string')
                ? data
                : data?.message || data?.error || 'Error al cambiar la contraseña';
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
                    ? 'Ingresa tu username para recibir un código'
                    : step === 2
                    ? 'Ingresa el código enviado a tu email'
                    : 'Crea tu nueva contraseña'
            }
            footer={(
                <span>
                    ¿Recuerdas tu contraseña? <Link to="/" className="text-indigo-300 hover:text-white">Inicia sesión</Link>
                </span>
            )}
        >
            {error && <p className="text-red-400 text-sm mb-4 text-center">{error}</p>}

            {/* STEP 1: Email */}
            {step === 1 && (
                <form onSubmit={handleStep1} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-indigo-200 mb-1">Username</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full p-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-indigo-300 focus:outline-none focus:border-indigo-400"
                            placeholder="Tu username"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition"
                    >
                        {loading ? 'Enviando...' : 'Enviar código'}
                    </button>
                </form>
            )}

            {/* STEP 2: Code */}
            {step === 2 && (
                <form onSubmit={handleStep2} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-indigo-200 mb-1">Código de Recuperación</label>
                        <input
                            type="text"
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            className="w-full p-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-indigo-300 focus:outline-none focus:border-indigo-400 text-center tracking-widest text-lg"
                            placeholder="000000"
                            maxLength="20"
                        />
                        <p className="text-indigo-300 text-xs mt-2">
                            Revisa tu email para encontrar el código
                        </p>
                    </div>
                    <button
                        type="submit"
                        className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold py-3 rounded-xl transition"
                    >
                        Verificar código
                    </button>
                    <button
                        type="button"
                        onClick={() => setStep(1)}
                        className="w-full bg-white/5 hover:bg-white/10 text-indigo-300 font-bold py-3 rounded-xl transition"
                    >
                        Volver
                    </button>
                </form>
            )}

            {/* STEP 3: New Password */}
            {step === 3 && (
                <form onSubmit={handleStep3} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-indigo-200 mb-1">Nueva Contraseña</label>
                        <div className="relative">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                className="w-full p-3 pr-12 rounded-lg bg-white/5 border border-white/10 text-white placeholder-indigo-300 focus:outline-none focus:border-indigo-400"
                                placeholder="Mínimo 8 caracteres"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword((v) => !v)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-indigo-200 hover:text-white text-sm"
                            >
                                {showPassword ? 'Ocultar' : 'Ver'}
                            </button>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-indigo-200 mb-1">Confirmar Contraseña</label>
                        <div className="relative">
                            <input
                                type={showConfirm ? 'text' : 'password'}
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="w-full p-3 pr-12 rounded-lg bg-white/5 border border-white/10 text-white placeholder-indigo-300 focus:outline-none focus:border-indigo-400"
                                placeholder="Confirma tu contraseña"
                            />
                            <button
                                type="button"
                                onClick={() => setShowConfirm((v) => !v)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-indigo-200 hover:text-white text-sm"
                            >
                                {showConfirm ? 'Ocultar' : 'Ver'}
                            </button>
                        </div>
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition"
                    >
                        {loading ? 'Cambiando...' : 'Cambiar contraseña'}
                    </button>
                    <button
                        type="button"
                        onClick={() => setStep(2)}
                        className="w-full bg-white/5 hover:bg-white/10 text-indigo-300 font-bold py-3 rounded-xl transition"
                    >
                        Volver
                    </button>
                </form>
            )}
        </AuthLayout>
    );
}
