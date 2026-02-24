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
            <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                    <label className="block text-sm font-medium text-indigo-200 mb-1">Usuario</label>
                    <input
                        type="text"
                        name="username"
                        onChange={handleChange}
                        className="w-full p-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder-indigo-300 focus:outline-none focus:border-indigo-400 text-sm"
                        placeholder="Mínimo 5 caracteres"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-indigo-200 mb-1">Email</label>
                    <input
                        type="email"
                        name="email"
                        onChange={handleChange}
                        className="w-full p-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder-indigo-300 focus:outline-none focus:border-indigo-400 text-sm"
                        placeholder="ejemplo@gmail.com"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-indigo-200 mb-1">Número de teléfono</label>
                    <input
                        type="tel"
                        name="numero"
                        onChange={handleChange}
                        className="w-full p-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder-indigo-300 focus:outline-none focus:border-indigo-400 text-sm"
                        placeholder="Ej: +50212345678"
                    />
                    <p className="text-xs text-indigo-300 mt-1">
                        Debe incluir el código de país con <span className="font-bold text-indigo-200">+</span> delante (ej: <span className="font-mono">+502</span> para Guatemala, <span className="font-mono">+34</span> para España)
                    </p>
                </div>
                <div>
                    <label className="block text-sm font-medium text-indigo-200 mb-1">Contraseña</label>
                    <div className="relative">
                        <input
                            type={showPassword ? 'text' : 'password'}
                            name="password"
                            onChange={handleChange}
                            className="w-full p-2.5 pr-12 rounded-lg bg-white/5 border border-white/10 text-white placeholder-indigo-300 focus:outline-none focus:border-indigo-400 text-sm"
                            placeholder="Min. 8 caracteres, número, mayúscula"
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
                </div>
                <div>
                    <label className="block text-sm font-medium text-indigo-200 mb-1">Confirmar Contraseña</label>
                    <div className="relative">
                        <input
                            type={showConfirm ? 'text' : 'password'}
                            name="confirm"
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            className="w-full p-2.5 pr-12 rounded-lg bg-white/5 border border-white/10 text-white placeholder-indigo-300 focus:outline-none focus:border-indigo-400 text-sm"
                            placeholder="Repite tu contraseña"
                        />
                        <button
                            type="button"
                            onClick={() => setShowConfirm((v) => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-indigo-200 hover:text-white text-sm"
                            aria-label="Mostrar/Ocultar confirmación"
                        >
                            {showConfirm ? 'Ocultar' : 'Ver'}
                        </button>
                    </div>
                </div>
                <button
                    type="submit"
                    className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold py-2.5 rounded-xl transition"
                >
                    Registrarse
                </button>
            </form>
            </AuthLayout>
        </>
    );
}
