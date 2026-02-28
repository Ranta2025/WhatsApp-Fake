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
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4 text-red-400 text-sm text-center">{error}</div>}
                
                <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1.5">Nombre de Usuario</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <svg className="h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                        </div>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full pl-10 p-3.5 rounded-xl bg-slate-800 border border-transparent text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                            placeholder="Ingresa tu usuario"
                        />
                    </div>
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full mt-6 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-indigo-500/20 transform transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                >
                    {loading ? 'Enviando...' : 'Enviar Código de Activación'}
                </button>
            </form>
        </AuthLayout>
    );
}