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
            title: 'Conversaciones al instante',
            description: 'Envia y recibe mensajes con fluidez, sin fricciones y con una lectura clara.'
        },
        {
            title: 'Privacidad que transmite confianza',
            description: 'Tu cuenta y tus accesos estan protegidos para que solo te ocupes de conversar.'
        },
        {
            title: 'Contactos bien organizados',
            description: 'Encuentra a cada persona rapido y manten tus conversaciones ordenadas.'
        },
        {
            title: 'Rendimiento que se siente',
            description: 'La experiencia responde con rapidez para que todo se sienta inmediato.'
        },
        {
            title: 'Diseno limpio y actual',
            description: 'Una interfaz pensada para que cada accion sea intuitiva en movil y escritorio.'
        },
        {
            title: 'Avisos oportunos',
            description: 'Mantente al tanto de lo importante sin perder el foco en tu dia.'
        }
    ];

    return (
        <div ref={containerRef} className="h-full overflow-y-auto bg-[#020617]">
            {/* Navbar */}
            <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${
                isScrolled ? 'bg-[#0B1120]/90 backdrop-blur-xl border-b border-white/[0.04]' : 'bg-transparent'
            }`}>
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-16">
                        <div className="flex items-center gap-2.5">
                            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 shadow-lg shadow-sky-500/10">
                                <img src="/todos.svg" alt="todos" className="w-5 h-5" />
                            </div>
                            <span className="text-white font-bold text-xl">todos</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setIsBugReportOpen(true)}
                                className="hidden sm:flex items-center gap-2 px-4 py-2 text-sm text-slate-400 hover:text-red-400 transition"
                                title="Reportar un problema"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 12v.01M12 8v.01M12 16v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Reportar problema
                            </button>
                            <Link
                                to="/login"
                                className="px-4 py-2 text-sm text-slate-300 hover:text-white transition-colors font-medium"
                            >
                                Iniciar Sesion
                            </Link>
                            <Link
                                to="/register"
                                className="rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-sky-500/10 transition-all duration-200 hover:shadow-sky-500/20 hover:brightness-105 active:scale-[0.98]"
                            >
                                Crear cuenta
                            </Link>
                        </div>
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="min-h-screen flex items-center justify-center px-4 pt-16 relative">
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                    <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-sky-500/[0.03] rounded-full blur-[120px]" />
                    <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-indigo-500/[0.03] rounded-full blur-[100px]" />
                </div>
                <div className="relative max-w-4xl mx-auto text-center">
                    <div className="animate-fade-in">
                        <div className="mx-auto mb-8 inline-flex items-center gap-2.5 rounded-full border border-white/[0.06] bg-white/[0.02] px-4 py-2 text-sm text-slate-300">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-500/15">
                                <img src="/todos.svg" alt="todos" className="h-4 w-4" />
                            </span>
                            Mensajes, grupos y llamadas en un solo lugar
                        </div>
                        <h1 className="mb-6 text-5xl font-bold text-white md:text-7xl tracking-tight leading-[1.1]">
                            Hablar, organizarte y conectar
                            <span className="block bg-gradient-to-r from-sky-400 to-indigo-400 bg-clip-text text-transparent"> se siente mejor aqui</span>
                        </h1>
                        <p className="mx-auto mb-10 max-w-2xl text-lg text-slate-400 leading-relaxed">
                            Una plataforma pensada para conversar con naturalidad, mantenerte cerca de tus contactos y moverte entre chats, grupos y llamadas sin esfuerzo.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                            <Link
                                to="/register"
                                className="rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 px-8 py-3.5 font-semibold text-white shadow-lg shadow-sky-500/15 transition-all duration-200 hover:shadow-sky-500/25 hover:brightness-105 active:scale-[0.98]"
                            >
                                Empieza ahora
                            </Link>
                            <Link
                                to="/login"
                                className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-8 py-3.5 font-medium text-white transition-all duration-200 hover:bg-white/[0.04]"
                            >
                                Ya tengo cuenta
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            {/* Features Section */}
            <section className="py-24 px-4 border-t border-white/[0.04]">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl md:text-4xl font-bold text-white mb-4 tracking-tight">
                            Todo lo que esperas de una experiencia moderna
                        </h2>
                        <p className="text-lg text-slate-400 max-w-xl mx-auto">
                            Menos friccion, mas claridad y una comunicacion que acompana tu ritmo
                        </p>
                    </div>

                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {features.map((feature, index) => (
                            <div
                                key={index}
                                className="rounded-2xl border border-white/[0.04] bg-white/[0.02] p-6 transition-all duration-300 hover:bg-white/[0.04] hover:border-white/[0.08]"
                            >
                                <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
                                <p className="text-slate-400 text-sm leading-relaxed">{feature.description}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* How It Works Section */}
            <section className="py-24 px-4 border-t border-white/[0.04]">
                <div className="max-w-4xl mx-auto">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl md:text-4xl font-bold text-white mb-4 tracking-tight">
                            Empezar es muy simple
                        </h2>
                        <p className="text-lg text-slate-400">
                            En pocos minutos tendras todo listo para conversar
                        </p>
                    </div>

                    <div className="space-y-8">
                        {[
                            { num: '01', title: 'Crea tu cuenta', desc: 'Define tus datos, personaliza tu perfil y prepara tu espacio en cuestion de segundos.' },
                            { num: '02', title: 'Organiza tus contactos', desc: 'Reune a las personas importantes y manten cada conversacion siempre al alcance.' },
                            { num: '03', title: 'Empieza a conversar', desc: 'Envia mensajes, crea grupos y pasa a llamada cuando la conversacion lo pida.' },
                        ].map((step) => (
                            <div key={step.num} className="flex items-start gap-6">
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-sky-500/20 to-indigo-500/20 border border-white/[0.06] flex items-center justify-center text-sky-400 font-bold text-sm flex-shrink-0">
                                    {step.num}
                                </div>
                                <div>
                                    <h3 className="text-xl font-semibold text-white mb-1">{step.title}</h3>
                                    <p className="text-slate-400 leading-relaxed">{step.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-24 px-4 border-t border-white/[0.04] relative overflow-hidden">
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-sky-500/[0.03] rounded-full blur-[100px]" />
                </div>
                <div className="relative max-w-3xl mx-auto text-center">
                    <h2 className="text-3xl md:text-4xl font-bold text-white mb-5 tracking-tight">
                        Tu proxima conversacion puede empezar ahora
                    </h2>
                    <p className="text-lg text-slate-400 mb-10">
                        Entra con una interfaz pensada para comunicarte mejor desde el primer clic
                    </p>
                    <Link
                        to="/register"
                        className="inline-block rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 px-10 py-3.5 text-base font-semibold text-white shadow-lg shadow-amber-500/15 transition-all duration-200 hover:shadow-amber-500/25 hover:brightness-105 active:scale-[0.98]"
                    >
                        Crear mi cuenta
                    </Link>
                </div>
            </section>

            {/* Footer */}
            <footer className="py-12 px-4 border-t border-white/[0.04] bg-[#0B1120]">
                <div className="max-w-6xl mx-auto">
                    <div className="grid md:grid-cols-4 gap-8 mb-10">
                        <div>
                            <div className="flex items-center gap-2.5 mb-4">
                                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600">
                                    <img src="/todos.svg" alt="todos" className="w-5 h-5" />
                                </div>
                                <span className="text-white font-bold text-xl">todos</span>
                            </div>
                            <p className="text-slate-500 text-sm leading-relaxed">
                                Una forma mas simple, actual y cercana de mantener tus conversaciones en movimiento.
                            </p>
                        </div>

                        <div>
                            <h4 className="text-white font-semibold mb-4 text-sm">Experiencia</h4>
                            <ul className="space-y-2.5 text-slate-500 text-sm">
                                <li><span className="hover:text-slate-300 transition cursor-default">Mensajes</span></li>
                                <li><span className="hover:text-slate-300 transition cursor-default">Grupos</span></li>
                                <li><span className="hover:text-slate-300 transition cursor-default">Llamadas</span></li>
                            </ul>
                        </div>

                        <div>
                            <h4 className="text-white font-semibold mb-4 text-sm">Ayuda</h4>
                            <ul className="space-y-2.5 text-slate-500 text-sm">
                                <li><span className="hover:text-slate-300 transition cursor-default">Centro de ayuda</span></li>
                                <li><span className="hover:text-slate-300 transition cursor-default">Soporte</span></li>
                                <li><button onClick={() => setIsBugReportOpen(true)} className="hover:text-slate-300 transition">Reportar un problema</button></li>
                            </ul>
                        </div>

                        <div>
                            <h4 className="text-white font-semibold mb-4 text-sm">Legal</h4>
                            <ul className="space-y-2.5 text-slate-500 text-sm">
                                <li><span className="hover:text-slate-300 transition cursor-default">Privacidad</span></li>
                                <li><span className="hover:text-slate-300 transition cursor-default">Terminos</span></li>
                                <li><span className="hover:text-slate-300 transition cursor-default">Cookies</span></li>
                            </ul>
                        </div>
                    </div>

                    <div className="border-t border-white/[0.04] pt-8">
                        <p className="text-center text-slate-600 text-sm">
                            &copy; 2026 todos. Disenado para conversar mejor.
                        </p>
                    </div>
                </div>
            </footer>

            <BugReportModal isOpen={isBugReportOpen} onClose={() => setIsBugReportOpen(false)} />
        </div>
    );
}
