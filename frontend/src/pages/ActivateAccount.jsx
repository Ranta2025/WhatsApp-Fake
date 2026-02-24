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
            setError('Tu cuenta está bloqueada. Contacta soporte.');
            return;
        }

        if (!code.trim()) {
            setError('Por favor ingresa el código de activación');
            return;
        }

        if (!username) {
            setError('Usuario no encontrado. Vuelve a registrarte.');
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
            alert("Cuenta activada exitosamente");
            // Navegar al dashboard
            navigate('/dashboard', { replace: true });
        } catch (err) {
            const data = err?.response?.data;
            const msg = (typeof data === 'string')
                ? data
                : data?.message || data?.error || 'Error al activar cuenta. Verifica el código.';
            alert("Error: " + msg);
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    const handleResendCode = async () => {
        setError('');
        setResendSuccess(false);

        if (isBloqueado) {
            setError('Tu cuenta está bloqueada. No puedes reenviar códigos.');
            return;
        }

        if (!username) {
            setError('Usuario no encontrado. Vuelve a registrarte.');
            return;
        }

        setResendLoading(true);
        try {
            await api.post('/recover', {
                username: username
            });
            setResendSuccess(true);
            setCode('');
            setTimeout(() => setResendSuccess(false), 5000);
        } catch (err) {
            const data = err?.response?.data;
            const msg = (typeof data === 'string')
                ? data
                : data?.message || data?.error || 'Error al reenviar el código.';
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
            subtitle={isBloqueado ? "Tu cuenta ha sido bloqueada" : "Ingresa el código enviado a tu email"}
            footer={(
                <span>
                    ¿Necesitas ayuda? <Link to="/login" className="text-indigo-300 hover:text-white">Volver al login</Link>
                </span>
            )}
        >
            {error && <p className="text-red-400 text-sm mb-4 text-center">{error}</p>}
            {resendSuccess && <p className="text-green-400 text-sm mb-4 text-center">✓ Código reenviado a tu email</p>}
            
            {isBloqueado ? (
                <div className="text-center py-8">
                    <p className="text-red-400 mb-4">Tu cuenta ha sido bloqueada. Por favor contacta con soporte para más información.</p>
                    <Link to="/login" className="text-indigo-300 hover:text-white underline">
                        Volver al inicio
                    </Link>
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-indigo-100 mb-1.5">Código de Activación</label>
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
                        disabled={loading}
                        className="w-full mt-6 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-indigo-500/30 transform transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                    >
                        {loading ? 'Verificando...' : 'Activar cuenta'}
                    </button>
                    <button
                        type="button"
                        onClick={handleResendCode}
                        disabled={resendLoading}
                        className="w-full bg-white/5 hover:bg-white/10 disabled:opacity-50 text-indigo-300 font-bold py-3.5 rounded-xl transition-all duration-200"
                    >
                        {resendLoading ? 'Reenviando...' : 'No recibí el código'}
                    </button>
                </form>
            )}
        </AuthLayout>
    );
}
