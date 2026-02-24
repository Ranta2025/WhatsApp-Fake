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
            <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                    <label className="block text-sm font-medium text-indigo-100 mb-1.5">Usuario</label>
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
                            className="w-full pl-10 p-3.5 rounded-xl bg-white/10 border border-white/20 text-white placeholder-indigo-200/50 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent focus:bg-white/20 transition-all duration-200"
                            placeholder="Tu usuario"
                        />
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-indigo-100 mb-1.5">Contraseña</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                            <svg className="w-5 h-5 text-indigo-300/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                        </div>
                        <input
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full pl-10 p-3.5 pr-12 rounded-xl bg-white/10 border border-white/20 text-white placeholder-indigo-200/50 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent focus:bg-white/20 transition-all duration-200 tracking-wide"
                            placeholder="••••••••"
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword((v) => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-indigo-200 hover:text-white text-sm font-medium transition-colors"
                            aria-label="Mostrar/Ocultar contraseña"
                        >
                            {showPassword ? 'Ocultar' : 'Ver'}
                        </button>
                    </div>
                    <div className="flex justify-between items-center text-xs mt-3 px-1">
                        <Link to="/recover-password" className="text-indigo-300 hover:text-indigo-100 transition-colors">
                            ¿Olvidaste tu contraseña?
                        </Link>
                        <Link to="/unblock-account" className="text-orange-300 hover:text-orange-200 transition-colors">
                            ¿Cuenta bloqueada?
                        </Link>
                    </div>
                </div>
                <button
                    type="submit"
                    className="w-full mt-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-indigo-500/30 transform transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                >
                    Entrar
                </button>
            </form>
            </AuthLayout>
        </>
    );
}
