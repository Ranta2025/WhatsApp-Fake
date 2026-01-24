import { useState } from 'react';
import api from '../api/axios';
import { useNavigate } from 'react-router-dom';

export default function Register() {
    const [formData, setFormData] = useState({
        username: '',
        email: '',
        numero: '',
        password: ''
    });
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            // Asumiendo endpoint de registro estándar, aunque tu backend actual usa /LogOut para crear usuarios
            // lo cual es un nombre confuso que mencionaré en el review.
            // Usaré /LogOut temporalmente porque así está tu backend:
            // func (s *HandlerUser) HandlerLogOut() ... "user create"
            await api.post('/register', formData); 
            navigate('/');
        } catch (err) {
            setError('Error al registrar usuario. Verifica los requisitos.');
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white">
            <div className="bg-gray-800 p-8 rounded-lg shadow-lg w-96">
                <h2 className="text-2xl font-bold mb-6 text-center">Crear Cuenta</h2>
                {error && <p className="text-red-500 text-sm mb-4 text-center">{error}</p>}
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">Usuario</label>
                        <input
                            type="text"
                            name="username"
                            onChange={handleChange}
                            className="w-full p-2 rounded bg-gray-700 border border-gray-600 focus:outline-none focus:border-green-500"
                            placeholder="Mínimo 5 caracteres"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Email</label>
                        <input
                            type="email"
                            name="email"
                            onChange={handleChange}
                            className="w-full p-2 rounded bg-gray-700 border border-gray-600 focus:outline-none focus:border-green-500"
                            placeholder="ejemplo@gmail.com"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Número</label>
                        <input
                            type="text"
                            name="numero"
                            onChange={handleChange}
                            className="w-full p-2 rounded bg-gray-700 border border-gray-600 focus:outline-none focus:border-green-500"
                            placeholder="8 dígitos"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Contraseña</label>
                        <input
                            type="password"
                            name="password"
                            onChange={handleChange}
                            className="w-full p-2 rounded bg-gray-700 border border-gray-600 focus:outline-none focus:border-green-500"
                            placeholder="Mínimo 8 caracteres, Num, Mayus"
                        />
                    </div>
                    <button
                        type="submit"
                        className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded transition duration-200"
                    >
                        Registrarse
                    </button>
                </form>
                <p className="mt-4 text-center text-sm text-gray-400">
                    ¿Ya tienes cuenta? <a href="/" className="text-green-400 hover:underline">Ingresa aquí</a>
                </p>
            </div>
        </div>
    );
}
