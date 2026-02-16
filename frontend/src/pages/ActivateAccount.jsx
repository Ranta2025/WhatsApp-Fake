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
                        <label className="block text-sm font-medium text-indigo-200 mb-1">Código de Activación</label>
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
                        disabled={loading}
                        className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition"
                    >
                        {loading ? 'Verificando...' : 'Activar cuenta'}
                    </button>
                    <button
                        type="button"
                        onClick={handleResendCode}
                        disabled={resendLoading}
                        className="w-full bg-white/5 hover:bg-white/10 disabled:opacity-50 text-indigo-300 font-bold py-3 rounded-xl transition"
                    >
                        {resendLoading ? 'Reenviando...' : 'No recibí el código'}
                    </button>
                </form>
            )}
        </AuthLayout>
    );
}
