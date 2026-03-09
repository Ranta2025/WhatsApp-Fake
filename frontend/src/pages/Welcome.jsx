import { Link } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import BugReportModal from '../components/BugReportModal';

export default function Welcome() {
    const [isScrolled, setIsScrolled] = useState(false);
    const [isBugReportOpen, setIsBugReportOpen] = useState(false);
    const containerRef = useRef(null);

    useEffect(() => {
        const handleScroll = () => {
            if (containerRef.current) {
                setIsScrolled(containerRef.current.scrollTop > 50);
            }
        };
        const container = containerRef.current;
        if (container) {
            container.addEventListener('scroll', handleScroll);
        }
        return () => {
            if (container) {
                container.removeEventListener('scroll', handleScroll);
            }
        };
    }, []);

    const features = [
        {
            icon: '💬',
            title: 'Conversaciones al instante',
            description: 'Envía y recibe mensajes con fluidez, sin fricciones y con una lectura clara.'
        },
        {
            icon: '🔒',
            title: 'Privacidad que transmite confianza',
            description: 'Tu cuenta y tus accesos están protegidos para que solo te ocupes de conversar.'
        },
        {
            icon: '👥',
            title: 'Contactos bien organizados',
            description: 'Encuentra a cada persona rápido y mantén tus conversaciones mejor ordenadas.'
        },
        {
            icon: '⚡',
            title: 'Rendimiento que se siente',
            description: 'La experiencia responde con rapidez para que todo se sienta inmediato.'
        },
        {
            icon: '🎨',
            title: 'Diseño limpio y actual',
            description: 'Una interfaz pensada para que cada acción sea intuitiva en móvil y escritorio.'
        },
        {
            icon: '🔔',
            title: 'Avisos oportunos',
            description: 'Mantente al tanto de lo importante sin perder el foco en tu día.'
        }
    ];

    const stats = [
        { number: '1', label: 'Lugar para todo' },
        { number: '24/7', label: 'Siempre disponible' },
        { number: '∞', label: 'Conversaciones' },
        { number: '100%', label: 'Enfocado en ti' }
    ];

    return (
        <div ref={containerRef} className="h-full overflow-y-auto bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.12),transparent_28%),linear-gradient(180deg,#020617_0%,#0f172a_45%,#020617_100%)]">
            {/* Navbar */}
            <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${
                isScrolled ? 'bg-slate-900/95 backdrop-blur-sm shadow-lg border-b border-white/5' : 'bg-transparent'
            }`}>
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-16">
                        <div className="flex items-center space-x-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[linear-gradient(135deg,#0ea5e9,#f59e0b)] shadow-lg shadow-sky-500/20">
                                <img src="/todos.svg" alt="todos" className="w-5 h-5" />
                            </div>
                            <span className="text-white font-bold text-xl">todos</span>
                        </div>
                        <div className="flex items-center space-x-3">
                            <button
                                onClick={() => setIsBugReportOpen(true)}
                                className="flex items-center gap-2 px-4 py-2 text-slate-400 hover:text-red-400 transition group"
                                title="Reportar un problema"
                            >
                                <span className="text-lg group-hover:scale-110 transition-transform">🐛</span>
                                <span className="hidden md:inline">Reportar problema</span>
                            </button>
                            <Link 
                                to="/login" 
                                className="px-4 py-2 text-slate-300 hover:text-white transition-colors font-medium"
                            >
                                Iniciar Sesión
                            </Link>
                            <Link 
                                to="/register" 
                                className="rounded-xl bg-[linear-gradient(135deg,#0ea5e9,#2563eb)] px-6 py-2.5 font-semibold text-white shadow-lg shadow-sky-500/20 transition-all duration-200 hover:scale-[1.02] hover:brightness-110 active:scale-[0.98]"
                            >
                                Crear cuenta
                            </Link>
                        </div>
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="min-h-screen flex items-center justify-center px-4 pt-16">
                <div className="max-w-5xl mx-auto text-center">
                    <div className="animate-fade-in">
                        <div className="mx-auto mb-6 inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 backdrop-blur-md">
                            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-400/20 ring-1 ring-sky-300/30">
                                <img src="/todos.svg" alt="todos" className="h-5 w-5" />
                            </span>
                            Mensajes, grupos y llamadas con una experiencia más clara
                        </div>
                        <h1 className="mb-6 text-5xl font-black text-white md:text-7xl">
                            Hablar, organizarte y conectar
                            <span className="bg-[linear-gradient(135deg,#38bdf8,#f59e0b)] bg-clip-text text-transparent"> se siente mejor aquí</span>
                        </h1>
                        <p className="mx-auto mb-8 max-w-3xl text-xl text-slate-400 md:text-2xl">
                            Una plataforma pensada para conversar con naturalidad, mantenerte cerca de tus contactos y moverte entre chats, grupos y llamadas sin esfuerzo.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                            <Link 
                                to="/register" 
                                className="rounded-2xl bg-[linear-gradient(135deg,#0ea5e9,#2563eb)] px-8 py-4 font-bold text-white shadow-lg shadow-sky-500/20 transition-all duration-200 hover:scale-[1.02] hover:brightness-110 active:scale-[0.98]"
                            >
                                Empieza ahora
                            </Link>
                            <Link 
                                to="/login" 
                                className="rounded-2xl border border-white/10 bg-slate-900/80 px-8 py-4 font-semibold text-white transition-all duration-200 hover:bg-slate-800"
                            >
                                Ya tengo cuenta
                            </Link>
                        </div>
                    </div>
                    
                    {/* Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-20">
                        {stats.map((stat, index) => (
                            <div key={index} className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-xl backdrop-blur-md">
                                <div className="text-3xl md:text-4xl font-bold text-white mb-2">{stat.number}</div>
                                <div className="text-slate-400 text-sm">{stat.label}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Features Section */}
            <section className="bg-slate-900/35 py-20 px-4">
                <div className="max-w-7xl mx-auto">
                    <div className="text-center mb-16">
                        <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
                            Todo lo que esperas de una experiencia moderna
                        </h2>
                        <p className="text-xl text-slate-400 max-w-2xl mx-auto">
                            Menos fricción, más claridad y una comunicación que acompaña tu ritmo
                        </p>
                    </div>
                    
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {features.map((feature, index) => (
                            <div 
                                key={index}
                                className="rounded-[1.8rem] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(15,23,42,0.9))] p-8 shadow-xl transition-all hover:scale-[1.02] hover:border-sky-400/20"
                            >
                                <div className="text-5xl mb-4">{feature.icon}</div>
                                <h3 className="text-xl font-bold text-white mb-3">{feature.title}</h3>
                                <p className="text-slate-400">{feature.description}</p>
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
                            Empezar es muy simple
                        </h2>
                        <p className="text-xl text-slate-400">
                            En pocos minutos tendrás todo listo para conversar
                        </p>
                    </div>
                    
                    <div className="space-y-12">
                        <div className="flex flex-col md:flex-row items-center gap-8">
                            <div className="w-20 h-20 bg-indigo-600 rounded-full flex items-center justify-center text-white text-2xl font-bold flex-shrink-0 shadow-lg shadow-indigo-500/20">
                                1
                            </div>
                            <div className="flex-1 text-center md:text-left">
                                <h3 className="text-2xl font-bold text-white mb-2">Crea tu cuenta</h3>
                                <p className="text-slate-400">
                                    Define tus datos, personaliza tu perfil y prepara tu espacio en cuestión de segundos.
                                </p>
                            </div>
                        </div>
                        
                        <div className="flex flex-col md:flex-row items-center gap-8">
                            <div className="w-20 h-20 bg-indigo-600 rounded-full flex items-center justify-center text-white text-2xl font-bold flex-shrink-0 shadow-lg shadow-indigo-500/20">
                                2
                            </div>
                            <div className="flex-1 text-center md:text-left">
                                <h3 className="text-2xl font-bold text-white mb-2">Organiza tus contactos</h3>
                                <p className="text-slate-400">
                                    Reúne a las personas importantes y mantén cada conversación siempre al alcance.
                                </p>
                            </div>
                        </div>
                        
                        <div className="flex flex-col md:flex-row items-center gap-8">
                            <div className="w-20 h-20 bg-indigo-600 rounded-full flex items-center justify-center text-white text-2xl font-bold flex-shrink-0 shadow-lg shadow-indigo-500/20">
                                3
                            </div>
                            <div className="flex-1 text-center md:text-left">
                                <h3 className="text-2xl font-bold text-white mb-2">Empieza a conversar</h3>
                                <p className="text-slate-400">
                                    Envía mensajes, crea grupos y pasa a llamada cuando la conversación lo pida.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-20 px-4 bg-slate-900 border-y border-white/5">
                <div className="max-w-4xl mx-auto text-center">
                    <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
                        Tu próxima conversación puede empezar ahora
                    </h2>
                    <p className="text-xl text-slate-400 mb-8">
                        Entra con una interfaz pensada para comunicarte mejor desde el primer clic
                    </p>
                    <Link 
                        to="/register" 
                        className="inline-block rounded-2xl bg-[linear-gradient(135deg,#f59e0b,#ea580c)] px-10 py-4 text-lg font-bold text-white shadow-xl shadow-orange-500/20 transition-all duration-200 hover:scale-[1.02] hover:brightness-110 active:scale-[0.98]"
                    >
                        Crear mi cuenta
                    </Link>
                </div>
            </section>

            {/* Footer */}
            <footer className="py-12 px-4 bg-slate-950">
                <div className="max-w-7xl mx-auto">
                    <div className="grid md:grid-cols-4 gap-8 mb-8">
                        <div>
                            <div className="flex items-center space-x-2 mb-4">
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[linear-gradient(135deg,#0ea5e9,#f59e0b)] shadow-lg shadow-sky-500/20">
                                    <img src="/todos.svg" alt="todos" className="w-5 h-5" />
                                </div>
                                <span className="text-white font-bold text-xl">todos</span>
                            </div>
                            <p className="text-slate-400 text-sm">
                                Una forma más simple, actual y cercana de mantener tus conversaciones en movimiento.
                            </p>
                        </div>
                        
                        <div>
                            <h4 className="text-white font-semibold mb-4">Experiencia</h4>
                            <ul className="space-y-2 text-slate-400 text-sm">
                                <li><a href="#" className="hover:text-white transition">Mensajes</a></li>
                                <li><a href="#" className="hover:text-white transition">Grupos</a></li>
                                <li><a href="#" className="hover:text-white transition">Llamadas</a></li>
                            </ul>
                        </div>
                        
                        <div>
                            <h4 className="text-white font-semibold mb-4">Ayuda</h4>
                            <ul className="space-y-2 text-slate-400 text-sm">
                                <li><a href="#" className="hover:text-white transition">Centro de ayuda</a></li>
                                <li><a href="#" className="hover:text-white transition">Soporte</a></li>
                                <li><a href="#" className="hover:text-white transition">Reportar un problema</a></li>
                            </ul>
                        </div>
                        
                        <div>
                            <h4 className="text-white font-semibold mb-4">Legal</h4>
                            <ul className="space-y-2 text-slate-400 text-sm">
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
                    
                    <div className="border-t border-white/5 pt-8">
                        <p className="text-center text-slate-500 text-sm">
                            © 2026 todos. Diseñado para conversar mejor.
                        </p>
                    </div>
                </div>
            </footer>
        </div>
    );
}
