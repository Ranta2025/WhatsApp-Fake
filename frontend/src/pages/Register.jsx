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
    const [error, setError] = useState('');
    const navigate = useNavigate();
    const { login } = useAuth();

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (formData.password !== confirm) {
            setError('Las contraseñas no coinciden');
            return;
        }
        try {
            await api.post('/register', formData);
            await login(formData.username, formData.password);
            navigate('/dashboard');
        } catch (err) {
            const data = err?.response?.data;
            const msg = (typeof data === 'string')
                ? data
                : data?.error || data?.message || err?.message || 'Error al registrar usuario. Verifica los requisitos.';
            setError(msg);
        }
    };

    return (
        <AuthLayout
            title="Crear tu cuenta"
            subtitle="Únete a ApiChat para conversar con tus contactos"
            footer={(
                <span>
                    ¿Ya tienes cuenta? <Link to="/" className="text-indigo-300 hover:text-white">Inicia sesión</Link>
                </span>
            )}
        >
            {error && <p className="text-red-400 text-sm mb-4 text-center">{error}</p>}
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-indigo-200 mb-1">Usuario</label>
                    <input
                        type="text"
                        name="username"
                        onChange={handleChange}
                        className="w-full p-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-indigo-300 focus:outline-none focus:border-indigo-400"
                        placeholder="Mínimo 5 caracteres"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-indigo-200 mb-1">Email</label>
                    <input
                        type="email"
                        name="email"
                        onChange={handleChange}
                        className="w-full p-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-indigo-300 focus:outline-none focus:border-indigo-400"
                        placeholder="ejemplo@gmail.com"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-indigo-200 mb-1">Número</label>
                    <input
                        type="text"
                        name="numero"
                        onChange={handleChange}
                        className="w-full p-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-indigo-300 focus:outline-none focus:border-indigo-400"
                        placeholder="8 dígitos"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-indigo-200 mb-1">Contraseña</label>
                    <input
                        type="password"
                        name="password"
                        onChange={handleChange}
                        className="w-full p-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-indigo-300 focus:outline-none focus:border-indigo-400"
                        placeholder="Mínimo 8 caracteres, número, mayúsculas, especial"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-indigo-200 mb-1">Confirmar Contraseña</label>
                    <input
                        type="password"
                        name="confirm"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        className="w-full p-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-indigo-300 focus:outline-none focus:border-indigo-400"
                        placeholder="Repite tu contraseña"
                    />
                </div>
                <button
                    type="submit"
                    className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold py-3 rounded-xl transition"
                >
                    Registrarse
                </button>
            </form>
        </AuthLayout>
    );
}
