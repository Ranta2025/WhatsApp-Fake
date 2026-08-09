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
                : data?.error || data?.message || err?.message || 'Credenciales invalidas o error de conexion';
            
            if (msg.toLowerCase().includes('bloqueado')) {
                navigate('/unblock-account', { state: { username: username } });
                return;
            }
            
            setError(msg);
        }
    };

    return (
        <AuthLayout
            title="Bienvenido de nuevo"
            subtitle="Inicia sesion para continuar"
            footer={
                <span>
                    No tienes cuenta? <Link to="/register" className="text-sky-400 hover:text-sky-300 transition-colors font-medium">Registrate</Link>
                </span>
            }
        >
            {error && (
                <div className="mb-5 rounded-xl bg-red-500/10 border border-red-500/15 px-4 py-3 text-center text-sm text-red-300">
                    {error}
                </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                    <label htmlFor="username" className="block text-sm font-medium text-slate-400 mb-2">Usuario</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                            <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                        </div>
                        <input
                            id="username"
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full rounded-xl border border-white/[0.06] bg-slate-900/50 p-3 pl-10 text-sm text-white placeholder-slate-500 transition-all focus:border-sky-500/30 focus:outline-none focus:ring-1 focus:ring-sky-500/15"
                            placeholder="Tu usuario"
                            autoComplete="username"
                        />
                    </div>
                </div>
                <div>
                    <label htmlFor="password" className="block text-sm font-medium text-slate-400 mb-2">Contrasena</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                            <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                        </div>
                        <input
                            id="password"
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full rounded-xl border border-white/[0.06] bg-slate-900/50 p-3 pl-10 pr-12 text-sm text-white placeholder-slate-500 tracking-wide transition-all focus:border-sky-500/30 focus:outline-none focus:ring-1 focus:ring-sky-500/15"
                            placeholder="••••••••"
                            autoComplete="current-password"
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword((v) => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-300 font-medium transition-colors"
                            aria-label="Mostrar/Ocultar contrasena"
                        >
                            {showPassword ? 'Ocultar' : 'Ver'}
                        </button>
                    </div>
                    <div className="flex justify-between items-center text-xs mt-3 px-1">
                        <Link to="/recover-password" className="text-sky-400/80 transition-colors hover:text-sky-400">
                            Olvidaste tu contrasena?
                        </Link>
                        <Link to="/unblock-account" className="text-amber-400/80 transition-colors hover:text-amber-400">
                            Cuenta bloqueada?
                        </Link>
                    </div>
                </div>
                <button
                    type="submit"
                    className="w-full rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 py-3 font-semibold text-white shadow-lg shadow-sky-500/10 transition-all duration-200 hover:shadow-sky-500/20 hover:brightness-105 active:scale-[0.98]"
                >
                    Entrar
                </button>
            </form>
        </AuthLayout>
    );
}
