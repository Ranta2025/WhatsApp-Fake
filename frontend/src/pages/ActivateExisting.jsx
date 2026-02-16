import { useState } from 'react';
import api from '../api/axios';
import { useNavigate, Link } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';

export default function ActivateExisting() {
    const [username, setUsername] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        
        if (!username.trim()) {
            setError('Por favor ingresa tu username');
            return;
        }

        setLoading(true);
        try {
            await api.post('/recover', {
                username: username
            });
            navigate('/activate', { state: { username } });
        } catch (err) {
            const data = err?.response?.data;
            const msg = (typeof data === 'string')
                ? data
                : data?.message || data?.error || 'Username no encontrado o cuenta ya activa';
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
                    ¿Necesitas ayuda? <Link to="/login" className="text-indigo-300 hover:text-white">Volver al login</Link>
                </span>
            )}
        >
            {error && <p className="text-red-400 text-sm mb-4 text-center">{error}</p>}
            <form onSubmit={handleSubmit} className="space-y-4">
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
        </AuthLayout>
    );
}