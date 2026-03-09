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
                className="fixed left-4 top-4 z-50 flex items-center gap-2 rounded-full border border-white/10 bg-slate-900/70 px-4 py-2 text-sm font-medium text-slate-300 backdrop-blur-md transition hover:border-sky-400/40 hover:text-white"
            >
                <span className="text-lg">←</span>
                <span>Volver a inicio</span>
            </Link>
            <AuthLayout
                title="Bienvenido de nuevo"
                subtitle="Inicia sesión para continuar"
                footer={
                    <span>
                        ¿No tienes cuenta? <Link to="/register" className="text-indigo-400 hover:text-indigo-300">Regístrate</Link>
                    </span>
                }
            >
            {error && <div className="mb-5 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-center text-sm text-rose-200">{error}</div>}
            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-400 sm:grid-cols-3">
                    <div className="rounded-xl bg-slate-950/60 px-3 py-2.5">
                        <div className="uppercase tracking-[0.2em] text-sky-300/80">Acceso</div>
                        <div className="mt-1 text-sm font-semibold text-slate-100">Entrada protegida</div>
                    </div>
                    <div className="rounded-xl bg-slate-950/60 px-3 py-2.5">
                        <div className="uppercase tracking-[0.2em] text-emerald-300/80">Experiencia</div>
                        <div className="mt-1 text-sm font-semibold text-slate-100">Rápida y simple</div>
                    </div>
                    <div className="rounded-xl bg-slate-950/60 px-3 py-2.5">
                        <div className="uppercase tracking-[0.2em] text-amber-300/80">Resultado</div>
                        <div className="mt-1 text-sm font-semibold text-slate-100">Todo al alcance</div>
                    </div>
                </div>
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
                            className="w-full rounded-2xl border border-white/10 bg-slate-950/70 p-3 pl-10 text-white placeholder-slate-500 transition-colors focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
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
                            className="w-full rounded-2xl border border-white/10 bg-slate-950/70 p-3 pl-10 pr-12 text-white placeholder-slate-500 tracking-wide transition-colors focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
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
                        <Link to="/recover-password" className="text-sky-300 transition-colors hover:text-sky-200">
                            ¿Olvidaste tu contraseña?
                        </Link>
                        <Link to="/unblock-account" className="text-amber-300 transition-colors hover:text-amber-200">
                            ¿Cuenta bloqueada?
                        </Link>
                    </div>
                </div>
                <button
                    type="submit"
                    className="w-full rounded-2xl bg-[linear-gradient(135deg,#0ea5e9,#2563eb)] py-3 font-bold text-white shadow-[0_20px_50px_-20px_rgba(14,165,233,0.8)] transition-all duration-200 hover:scale-[1.01] hover:brightness-110 active:scale-[0.98]"
                >
                    Entrar
                </button>
            </form>
            </AuthLayout>
        </>
    );
}
