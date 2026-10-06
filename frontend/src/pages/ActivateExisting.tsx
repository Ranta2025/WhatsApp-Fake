import { useState, type FormEvent } from 'react';
import api from '../api/axios';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';
import { getErrorMessage } from '../lib/errors';

export default function ActivateExisting() {
    const location = useLocation();
    const [username, setUsername] = useState(location.state?.username || '');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError('');
        
        if (!username.trim()) {
            setError('Por favor ingresa tu username');
            return;
        }

        setLoading(true);
        try {
            await api.post('/api/v1/auth/resend-activation', {
                username: username
            });
            navigate('/activate', { state: { username } });
        } catch (err) {
            const msg = getErrorMessage(err, 'Username no encontrado o cuenta ya activa', { prefer: 'message', fallbackToErrorMessage: false });
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout
            title="Activar cuenta"
            subtitle="Ingresa tu username para recibir un código de activación"
            footer={(
                <span>
                    ¿Necesitas ayuda? <Link to="/login" className="text-indigo-300 hover:text-fg">Volver al login</Link>
                </span>
            )}
        >
            {error && <p className="text-red-400 text-sm mb-4 text-center">{error}</p>}
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-indigo-100 mb-1.5">Username</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                            <svg className="w-5 h-5 text-indigo-300/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                        </div>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full pl-10 p-3.5 rounded-xl bg-fg/10 border border-fg/20 text-fg placeholder-indigo-200/50 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent focus:bg-fg/20 transition-all duration-200"
                            placeholder="Tu username"
                        />
                    </div>
                </div>
                <button
                    type="submit"
                    disabled={loading}
                    className="btn-primary w-full mt-6"
                >
                    {loading ? 'Enviando...' : 'Enviar código'}
                </button>
            </form>
        </AuthLayout>
    );
}