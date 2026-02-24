import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import BugReportModal from '../components/BugReportModal';

export default function Welcome() {
    const [isScrolled, setIsScrolled] = useState(false);
    const [isBugReportOpen, setIsBugReportOpen] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 50);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const features = [
        {
            icon: '💬',
            title: 'Chat en Tiempo Real',
            description: 'Comunícate instantáneamente con tus contactos mediante WebSockets.'
        },
        {
            icon: '🔒',
            title: 'Seguridad Avanzada',
            description: 'Autenticación JWT, contraseñas encriptadas y tokens seguros.'
        },
        {
            icon: '👥',
            title: 'Gestión de Contactos',
            description: 'Añade, gestiona y organiza tus contactos de forma sencilla.'
        },
        {
            icon: '⚡',
            title: 'Rápido y Eficiente',
            description: 'Backend en Go con Redis y PostgreSQL para máximo rendimiento.'
        },
        {
            icon: '🎨',
            title: 'Interfaz Moderna',
            description: 'Diseño elegante y responsive con React y Tailwind CSS.'
        },
        {
            icon: '🔔',
            title: 'Notificaciones',
            description: 'Recibe alertas en tiempo real de mensajes y actividades.'
        }
    ];

    const stats = [
        { number: '100%', label: 'Seguro' },
        { number: '<50ms', label: 'Latencia' },
        { number: '24/7', label: 'Disponible' },
        { number: '∞', label: 'Mensajes' }
    ];

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900 overflow-y-auto">
            {/* Navbar */}
            <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${
                isScrolled ? 'bg-gray-900/95 backdrop-blur-sm shadow-lg' : 'bg-transparent'
            }`}>
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-16">
                        <div className="flex items-center space-x-2">
                            <img src="/todos.svg" alt="todos" className="w-9 h-9" />
                            <span className="text-white font-bold text-xl">todos</span>
                        </div>
                        <div className="flex items-center space-x-3">
                            <button
                                onClick={() => setIsBugReportOpen(true)}
                                className="flex items-center gap-2 px-4 py-2 text-white hover:text-red-300 transition group"
                                title="Reportar un bug"
                            >
                                <span className="text-lg group-hover:scale-110 transition-transform">🐛</span>
                                <span className="hidden md:inline">Reportar Bug</span>
                            </button>
                            <Link 
                                to="/login" 
                                className="px-4 py-2 text-white hover:text-indigo-300 transition"
                            >
                                Iniciar Sesión
                            </Link>
                            <Link 
                                to="/register" 
                                className="px-6 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold rounded-lg transition"
                            >
                                Registrarse
                            </Link>
                        </div>
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="min-h-screen flex items-center justify-center px-4 pt-16">
                <div className="max-w-5xl mx-auto text-center">
                    <div className="animate-fade-in">
                        <h1 className="text-5xl md:text-7xl font-bold text-white mb-6">
                            Conecta con el
                            <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent"> Mundo</span>
                        </h1>
                        <p className="text-xl md:text-2xl text-indigo-200 mb-8 max-w-3xl mx-auto">
                            La plataforma de mensajería instantánea más rápida y segura. 
                            Chatea en tiempo real con tus contactos desde cualquier lugar.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                            <Link 
                                to="/register" 
                                className="px-8 py-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold rounded-xl transition transform hover:scale-105 shadow-lg"
                            >
                                Comenzar Gratis
                            </Link>
                            <Link 
                                to="/login" 
                                className="px-8 py-4 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-xl transition border border-white/20"
                            >
                                Ya tengo cuenta
                            </Link>
                        </div>
                    </div>
                    
                    {/* Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-20">
                        {stats.map((stat, index) => (
                            <div key={index} className="bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10">
                                <div className="text-3xl md:text-4xl font-bold text-white mb-2">{stat.number}</div>
                                <div className="text-indigo-300 text-sm">{stat.label}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Features Section */}
            <section className="py-20 px-4 bg-black/20">
                <div className="max-w-7xl mx-auto">
                    <div className="text-center mb-16">
                        <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
                            Características Increíbles
                        </h2>
                        <p className="text-xl text-indigo-300 max-w-2xl mx-auto">
                            Todo lo que necesitas para una experiencia de chat excepcional
                        </p>
                    </div>
                    
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {features.map((feature, index) => (
                            <div 
                                key={index}
                                className="bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-white/10 hover:border-purple-500/50 transition-all hover:transform hover:scale-105"
                            >
                                <div className="text-5xl mb-4">{feature.icon}</div>
                                <h3 className="text-xl font-bold text-white mb-3">{feature.title}</h3>
                                <p className="text-indigo-200">{feature.description}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* How It Works Section */}
            <section className="py-20 px-4">
                <div className="max-w-5xl mx-auto">
                    <div className="text-center mb-16">
                        <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
                            Cómo Funciona
                        </h2>
                        <p className="text-xl text-indigo-300">
                            En solo 3 simples pasos
                        </p>
                    </div>
                    
                    <div className="space-y-12">
                        <div className="flex flex-col md:flex-row items-center gap-8">
                            <div className="w-20 h-20 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-full flex items-center justify-center text-white text-2xl font-bold flex-shrink-0">
                                1
                            </div>
                            <div className="flex-1 text-center md:text-left">
                                <h3 className="text-2xl font-bold text-white mb-2">Regístrate</h3>
                                <p className="text-indigo-200">
                                    Crea tu cuenta en segundos. Solo necesitas un nombre de usuario, email y contraseña.
                                </p>
                            </div>
                        </div>
                        
                        <div className="flex flex-col md:flex-row items-center gap-8">
                            <div className="w-20 h-20 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-full flex items-center justify-center text-white text-2xl font-bold flex-shrink-0">
                                2
                            </div>
                            <div className="flex-1 text-center md:text-left">
                                <h3 className="text-2xl font-bold text-white mb-2">Añade Contactos</h3>
                                <p className="text-indigo-200">
                                    Busca y añade a tus amigos usando su código único de 8 dígitos.
                                </p>
                            </div>
                        </div>
                        
                        <div className="flex flex-col md:flex-row items-center gap-8">
                            <div className="w-20 h-20 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-full flex items-center justify-center text-white text-2xl font-bold flex-shrink-0">
                                3
                            </div>
                            <div className="flex-1 text-center md:text-left">
                                <h3 className="text-2xl font-bold text-white mb-2">¡Chatea!</h3>
                                <p className="text-indigo-200">
                                    Comienza a chatear en tiempo real. Tus mensajes se entregan instantáneamente.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-20 px-4 bg-gradient-to-r from-purple-900/50 to-indigo-900/50">
                <div className="max-w-4xl mx-auto text-center">
                    <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
                        ¿Listo para comenzar?
                    </h2>
                    <p className="text-xl text-indigo-200 mb-8">
                        Únete a miles de usuarios que ya disfrutan de la mejor experiencia de chat
                    </p>
                    <Link 
                        to="/register" 
                        className="inline-block px-10 py-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-lg rounded-xl transition transform hover:scale-105 shadow-xl"
                    >
                        Crear Cuenta Ahora
                    </Link>
                </div>
            </section>

            {/* Footer */}
            <footer className="py-12 px-4 bg-black/40">
                <div className="max-w-7xl mx-auto">
                    <div className="grid md:grid-cols-4 gap-8 mb-8">
                        <div>
                            <div className="flex items-center space-x-2 mb-4">
                                <img src="/todos.svg" alt="todos" className="w-9 h-9" />
                                <span className="text-white font-bold text-xl">todos</span>
                            </div>
                            <p className="text-indigo-300 text-sm">
                                La plataforma de mensajería instantánea del futuro.
                            </p>
                        </div>
                        
                        <div>
                            <h4 className="text-white font-semibold mb-4">Producto</h4>
                            <ul className="space-y-2 text-indigo-300 text-sm">
                                <li><a href="#" className="hover:text-white transition">Características</a></li>
                                <li><a href="#" className="hover:text-white transition">Seguridad</a></li>
                                <li><a href="#" className="hover:text-white transition">Precios</a></li>
                            </ul>
                        </div>
                        
                        <div>
                            <h4 className="text-white font-semibold mb-4">Soporte</h4>
                            <ul className="space-y-2 text-indigo-300 text-sm">
                                <li><a href="#" className="hover:text-white transition">Ayuda</a></li>
                                <li><a href="#" className="hover:text-white transition">Documentación</a></li>
                                <li><a href="#" className="hover:text-white transition">Contacto</a></li>
                            </ul>
                        </div>
                        
                        <div>
                            <h4 className="text-white font-semibold mb-4">Legal</h4>
                            <ul className="space-y-2 text-indigo-300 text-sm">
                                <li><a href="#" className="hover:text-white transition">Privacidad</a></li>
                                <li><a href="#" className="hover:text-white transition">Términos</a></li>
                                <li><a href="#" className="hover:text-white transition">Cookies</a></li>
                            </ul>
                        </div>
                    </div>

            {/* Bug Report Modal */}
            <BugReportModal 
                isOpen={isBugReportOpen} 
                onClose={() => setIsBugReportOpen(false)} 
            />
                    
                    <div className="border-t border-white/10 pt-8">
                        <p className="text-center text-indigo-300 text-sm">
                            © 2026 ChatApp. Todos los derechos reservados.
                        </p>
                    </div>
                </div>
            </footer>
        </div>
    );
}
