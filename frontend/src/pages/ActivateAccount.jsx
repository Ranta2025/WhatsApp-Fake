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
                <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 mb-6 text-center">
                    <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                        <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <h3 className="text-lg font-bold text-white mb-1">¡Cuenta Activada!</h3>
                    <p className="text-green-400 text-sm">Tu cuenta ha sido verificada exitosamente.</p>
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                    {error && <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4 text-red-400 text-sm text-center">{error}</div>}
                    
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1.5">Código de Activación</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <svg className="h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                            </div>
                            <input
                                type="text"
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                                className="w-full pl-10 p-3.5 rounded-xl bg-slate-800 border border-transparent text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors text-center tracking-widest text-lg"
                                placeholder="000000"
                                maxLength="20"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full mt-6 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-indigo-500/20 transform transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                    >
                        {loading ? 'Verificando...' : 'Activar Cuenta'}
                    </button>
                </form>
            )}
        </AuthLayout>
    );
}
