import { useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';
import { getErrorMessage } from '../lib/errors';
import { postLoginPath } from '../utils/loginRedirect';

export default function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!username.trim() || !password) {
            setError('Completa usuario y contraseña');
            return;
        }
        setError('');
        setLoading(true);
        try {
            await login(username.trim(), password);
            // Back to where PrivateRoute bounced from (e.g. /dashboard?chat=… from a notification).
            navigate(postLoginPath(location.state), { replace: true });
        } catch (err) {
            setLoading(false);
            const msg = getErrorMessage(err, 'Credenciales inválidas o error de conexión');
            
            // Si el usuario está bloqueado, redirigir a la página de desbloqueo
            if (msg.toLowerCase().includes('bloqueado')) {
                navigate('/unblock-account', { state: { username: username } });
                return;
            }
            // Cuenta sin activar: llevar a la pantalla de activación
            if (msg.toLowerCase().includes('inactivo')) {
                navigate('/activate-existing', { state: { username: username } });
                return;
            }
            
            setError(msg);
        }
    };

    return (
        <>
            <AuthLayout
                title="Bienvenido de nuevo"
                subtitle="Inicia sesión para continuar"
                footer={
                    <span>
                        ¿No tienes cuenta? <Link to="/register" className="text-indigo-400 hover:text-indigo-300">Regístrate</Link>
                    </span>
                }
            >
            {error && <div role="alert" className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 mb-5 text-rose-300 text-sm">{error}</div>}
            <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                    <label htmlFor="username" className="block text-sm font-medium text-slate-400 mb-1.5">Usuario</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                            <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                        </div>
                        <input
                            id="username"
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full pl-10 p-3 rounded-xl bg-slate-800/80 border border-white/[0.06] text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-colors"
                            placeholder="Tu usuario"
                            autoComplete="username"
                        />
                    </div>
                </div>
                <div>
                    <label htmlFor="password" className="block text-sm font-medium text-slate-400 mb-1.5">Contraseña</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                            <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                        </div>
                        <input
                            id="password"
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full pl-10 p-3 pr-16 rounded-xl bg-slate-800/80 border border-white/[0.06] text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-colors tracking-wide"
                            placeholder="••••••••"
                            autoComplete="current-password"
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword((v) => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-sm font-medium transition-colors"
                            aria-label="Mostrar/Ocultar contraseña"
                        >
                            {showPassword ? 'Ocultar' : 'Ver'}
                        </button>
                    </div>
                    <div className="flex justify-between items-center text-xs mt-3 px-1">
                        <Link to="/recover-password" className="text-indigo-400 hover:text-indigo-300 transition-colors">
                            ¿Olvidaste tu contraseña?
                        </Link>
                        <Link to="/unblock-account" className="text-amber-400 hover:text-amber-300 transition-colors">
                            ¿Cuenta bloqueada?
                        </Link>
                    </div>
                </div>
                <button type="submit" disabled={loading} className="btn-primary w-full">
                    {loading ? 'Entrando…' : 'Entrar'}
                </button>
            </form>
            </AuthLayout>
        </>
    );
}
