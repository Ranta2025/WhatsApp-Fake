import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';

export default function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            await login(username, password);
            navigate('/dashboard');
        } catch (err) {
            const data = err?.response?.data;
            const msg = (typeof data === 'string')
                ? data
                : data?.error || data?.message || err?.message || 'Credenciales inválidas o error de conexión';
            
            // Si el usuario está bloqueado, redirigir a la página de desbloqueo
            if (msg.toLowerCase().includes('bloqueado')) {
                navigate('/unblock-account', { state: { username: username } });
                return;
            }
            
            setError(msg);
        }
    };

    return (
        <>
            <Link 
                to="/" 
                className="fixed top-4 left-4 text-white hover:text-indigo-300 transition flex items-center gap-2 z-50"
            >
                <span className="text-xl">←</span>
                <span className="text-sm font-medium">Volver a inicio</span>
            </Link>
            <AuthLayout
                title="Bienvenido de nuevo"
                subtitle="Inicia sesión para continuar"
                footer={
                    <span>
                        ¿No tienes cuenta? <Link to="/register" className="text-indigo-300 hover:text-white">Regístrate</Link>
                    </span>
                }
            >
            {error && <p className="text-red-400 text-sm mb-4 text-center">{error}</p>}
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-indigo-200 mb-1">Usuario</label>
                    <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="w-full p-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-indigo-300 focus:outline-none focus:border-indigo-400"
                        placeholder="Tu usuario"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-indigo-200 mb-1">Contraseña</label>
                    <div className="relative">
                        <input
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full p-3 pr-12 rounded-lg bg-white/5 border border-white/10 text-white placeholder-indigo-300 focus:outline-none focus:border-indigo-400"
                            placeholder="••••••••"
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword((v) => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-indigo-200 hover:text-white text-sm"
                            aria-label="Mostrar/Ocultar contraseña"
                        >
                            {showPassword ? 'Ocultar' : 'Ver'}
                        </button>
                    </div>
                    <div className="flex justify-between items-center text-xs mt-2">
                        <Link to="/recover-password" className="text-indigo-300 hover:text-white">
                            ¿Olvidaste tu contraseña?
                        </Link>
                        <Link to="/unblock-account" className="text-orange-300 hover:text-white">
                            ¿Cuenta bloqueada?
                        </Link>
                    </div>
                </div>
                <button
                    type="submit"
                    className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold py-3 rounded-xl transition"
                >
                    Entrar
                </button>
            </form>
            </AuthLayout>
        </>
    );
}
