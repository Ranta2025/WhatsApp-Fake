import { useState } from 'react';
import api from '../api/axios';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AuthLayout from '../components/AuthLayout';

export default function Register() {
    const [formData, setFormData] = useState({
        username: '',
        email: '',
        numero: '',
        password: ''
    });
    const [confirm, setConfirm] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [error, setError] = useState('');
    const navigate = useNavigate();
    const { login } = useAuth();

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const phoneE164Regex = /^\+[1-9]\d{6,14}$/;

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!formData.numero.trim()) {
            setError('El número de teléfono es requerido');
            return;
        }
        if (!phoneE164Regex.test(formData.numero.trim())) {
            setError('El número debe incluir el código de país con "+" delante (ej: +50212345678). Sin espacios ni guiones.');
            return;
        }
        if (formData.password !== confirm) {
            setError('Las contraseñas no coinciden');
            return;
        }
        try {
            const { data } = await api.post('/register', formData);
            // Guardar token si viene en la respuesta
            if (data?.token) {
                localStorage.setItem('token', data.token);
            }
            navigate('/activate', { state: { username: formData.username, gmail: formData.email } });
        } catch (err) {
            const data = err?.response?.data;
            const msg = (typeof data === 'string')
                ? data
                : data?.error || data?.message || err?.message || 'Error al registrar usuario. Verifica los requisitos.';
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
                title="Crear tu cuenta"
                subtitle="Únete a todos para conversar con tus contactos"
                footer={() => (
                    <div className="space-y-2 text-center">
                        <div>
                            <span className="text-gray-300">
                                ¿Ya tienes cuenta?{' '}
                                <Link to="/login" className="text-indigo-300 hover:text-white font-semibold">
                                    Inicia sesión
                                </Link>
                            </span>
                        </div>
                        <div>
                            <span className="text-gray-300">
                                ¿Cuenta inactiva?{' '}
                                <Link to="/activate-existing" className="text-indigo-300 hover:text-white font-semibold">
                                    Activar cuenta
                                </Link>
                            </span>
                        </div>
                    </div>
                )}
            >
            {error && <p className="text-red-400 text-sm mb-3 text-center">{error}</p>}
            <form onSubmit={handleSubmit} className="space-y-4">
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
                            name="username"
                            onChange={handleChange}
                            className="w-full pl-10 p-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-indigo-200/50 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent focus:bg-white/20 transition-all duration-200 text-sm"
                            placeholder="Mínimo 5 caracteres"
                        />
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-indigo-100 mb-1.5">Email</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                            <svg className="w-5 h-5 text-indigo-300/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                        </div>
                        <input
                            type="email"
                            name="email"
                            onChange={handleChange}
                            className="w-full pl-10 p-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-indigo-200/50 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent focus:bg-white/20 transition-all duration-200 text-sm"
                            placeholder="ejemplo@gmail.com"
                        />
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-indigo-100 mb-1.5">Número de teléfono</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                            <svg className="w-5 h-5 text-indigo-300/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                            </svg>
                        </div>
                        <input
                            type="tel"
                            name="numero"
                            onChange={handleChange}
                            className="w-full pl-10 p-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-indigo-200/50 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent focus:bg-white/20 transition-all duration-200 text-sm"
                            placeholder="Ej: +50212345678"
                        />
                    </div>
                    <p className="text-xs text-indigo-300/80 mt-1.5 ml-1">
                        Debe incluir el código de país con <span className="font-bold text-indigo-200">+</span> delante (ej: <span className="font-mono">+502</span> para Guatemala)
                    </p>
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
                            name="password"
                            onChange={handleChange}
                            className="w-full pl-10 p-3 pr-12 rounded-xl bg-white/10 border border-white/20 text-white placeholder-indigo-200/50 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent focus:bg-white/20 transition-all duration-200 text-sm tracking-wide"
                            placeholder="Min. 8 caracteres, número, mayúscula"
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
                </div>
                <div>
                    <label className="block text-sm font-medium text-indigo-100 mb-1.5">Confirmar Contraseña</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                            <svg className="w-5 h-5 text-indigo-300/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                        </div>
                        <input
                            type={showConfirm ? 'text' : 'password'}
                            name="confirm"
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            className="w-full pl-10 p-3 pr-12 rounded-xl bg-white/10 border border-white/20 text-white placeholder-indigo-200/50 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent focus:bg-white/20 transition-all duration-200 text-sm tracking-wide"
                            placeholder="Repite tu contraseña"
                        />
                        <button
                            type="button"
                            onClick={() => setShowConfirm((v) => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-indigo-200 hover:text-white text-sm font-medium transition-colors"
                            aria-label="Mostrar/Ocultar confirmación"
                        >
                            {showConfirm ? 'Ocultar' : 'Ver'}
                        </button>
                    </div>
                </div>
                <button
                    type="submit"
                    className="w-full mt-4 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-indigo-500/30 transform transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                >
                    Registrarse
                </button>
            </form>
            </AuthLayout>
        </>
    );
}
