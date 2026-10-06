import { Link } from 'react-router-dom';
import { useState, useEffect, useRef, type ComponentType } from 'react';
import BugReportModal from '../components/BugReportModal';
import { useAuth } from '../context/AuthContext';
import {
    ChatIcon, PhoneIcon, GroupIcon, MicIcon, LockIcon, BellIcon,
    ArrowTrendingUpIcon, SparklesIcon, MapPinIcon, CheckCircleIcon,
} from '../components/ui/icons';

const FEATURES = [
    { Icon: ChatIcon, title: 'Chat en tiempo real', description: 'Mensajes instantáneos con confirmaciones de entrega y lectura, y el indicador de "escribiendo…".' },
    { Icon: PhoneIcon, title: 'Llamadas y video', description: 'Llama o haz videollamadas a tus contactos directamente desde el chat.' },
    { Icon: GroupIcon, title: 'Grupos', description: 'Crea grupos, añade a tus contactos y conversa con todos a la vez.' },
    { Icon: MicIcon, title: 'Notas de voz y archivos', description: 'Envía audios, fotos, videos y documentos en segundos.' },
    { Icon: LockIcon, title: 'Seguro', description: 'Sesiones protegidas, contraseñas cifradas y verificación por correo.' },
    { Icon: BellIcon, title: 'Notificaciones', description: 'Entérate de cada mensaje aunque tengas la app en segundo plano.' },
];

const STEPS = [
    { title: 'Crea tu cuenta', text: 'Regístrate con tu correo y tu número de teléfono.' },
    { title: 'Añade contactos', text: 'Búscalos por su número y ponles el nombre que quieras.' },
    { title: '¡A conversar!', text: 'Chatea, llama o crea grupos al instante.' },
];

/** Maqueta de la app para el hero */
interface MockupChat {
    name: string;
    gradient: string;
    preview: string;
    PreviewIcon?: ComponentType<{ className?: string }>;
    active: boolean;
}

const MOCKUP_CHATS: MockupChat[] = [
    { name: 'Laura', gradient: 'from-amber-500 to-rose-500', preview: '¿Nos vemos a las 8?', active: true },
    { name: 'Equipo', gradient: 'from-indigo-500 to-purple-500', preview: 'Ana: ¡listo!', PreviewIcon: ArrowTrendingUpIcon, active: false },
    { name: 'Marcos', gradient: 'from-sky-500 to-indigo-500', preview: 'Nota de voz', active: false },
];

const AppMockup = () => (
    <div className="relative w-full max-w-xl mx-auto">
        <div className="absolute -inset-6 bg-gradient-to-r from-indigo-500/25 to-purple-500/25 blur-3xl rounded-full" aria-hidden="true" />
        <div className="relative glass rounded-3xl overflow-hidden shadow-2xl shadow-black/50 flex h-[340px] sm:h-[380px]">
            <div className="hidden sm:flex flex-col w-44 border-r border-fg/[0.06] bg-slate-900/60 p-3 gap-1.5">
                {MOCKUP_CHATS.map(({ name, gradient, preview, PreviewIcon, active }) => (
                    <div key={name} className={`flex items-center gap-2 rounded-xl p-2 ${active ? 'bg-indigo-500/10 ring-1 ring-indigo-500/20' : ''}`}>
                        <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-xs font-semibold`}>{name.charAt(0)}</div>
                        <div className="min-w-0">
                            <div className="text-xs font-semibold truncate">{name}</div>
                            <div className="text-[10px] text-slate-400 truncate flex items-center gap-1">
                                {preview}
                                {PreviewIcon && <PreviewIcon className="w-2.5 h-2.5 flex-shrink-0" />}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            <div className="flex-1 flex flex-col chat-surface">
                <div className="flex items-center gap-2.5 px-4 py-3 border-b border-fg/[0.06] bg-slate-900/60">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500 to-rose-500 flex items-center justify-center text-xs font-semibold">L</div>
                    <div>
                        <div className="text-sm font-semibold">Laura</div>
                        <div className="text-[11px] text-indigo-400">en línea</div>
                    </div>
                </div>
                <div className="flex-1 p-4 space-y-2.5 text-sm">
                    <div className="flex justify-start"><div className="bg-slate-800 rounded-2xl rounded-bl-md px-3.5 py-2 max-w-[80%] flex items-center gap-1.5">¡Hola! ¿Nos vemos a las 8? <SparklesIcon className="w-3.5 h-3.5 flex-shrink-0 text-amber-300" /></div></div>
                    <div className="flex justify-end"><div className="bg-indigo-700 text-on-accent rounded-2xl rounded-br-md px-3.5 py-2 max-w-[80%] flex items-center gap-1.5">¡Claro! Te llamo al salir <PhoneIcon className="w-3.5 h-3.5 flex-shrink-0" /></div></div>
                    <div className="flex justify-start"><div className="bg-slate-800 rounded-2xl rounded-bl-md px-3.5 py-2 max-w-[80%] flex items-center gap-1.5">Perfecto, te mando la ubicación <MapPinIcon className="w-3.5 h-3.5 flex-shrink-0 text-rose-300" /></div></div>
                    <div className="flex justify-end"><div className="bg-indigo-700 text-on-accent rounded-2xl rounded-br-md px-3.5 py-2 flex items-center gap-1"><CheckCircleIcon className="w-4 h-4 flex-shrink-0" /> <span className="text-[10px] text-on-accent/60 ml-1">✓✓</span></div></div>
                </div>
                <div className="p-3 border-t border-fg/[0.06] bg-slate-900/60 flex items-center gap-2">
                    <div className="flex-1 h-9 rounded-xl bg-slate-800/80 px-3 flex items-center text-xs text-slate-500">Escribe un mensaje…</div>
                    <div className="w-9 h-9 rounded-full bg-indigo-500" />
                </div>
            </div>
        </div>
    </div>
);

export default function Welcome() {
    const { user } = useAuth();
    const [isScrolled, setIsScrolled] = useState(false);
    const [isBugReportOpen, setIsBugReportOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const handleScroll = () => setIsScrolled(container.scrollTop > 20);
        container.addEventListener('scroll', handleScroll, { passive: true });
        return () => container.removeEventListener('scroll', handleScroll);
    }, []);

    return (
        <div ref={containerRef} className="h-full overflow-y-auto hero-surface text-slate-100">
            {/* Navegación */}
            <nav className={`sticky top-0 z-40 transition-all ${isScrolled ? 'bg-slate-950/80 backdrop-blur-xl border-b border-fg/[0.06]' : ''}`}>
                <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
                    <Link to="/" className="flex items-center gap-2.5">
                        <img src="/todos.svg" alt="" className="w-8 h-8" />
                        <span className="text-lg font-bold tracking-tight">todos</span>
                    </Link>
                    <div className="flex items-center gap-2 sm:gap-3">
                        <button
                            onClick={() => setIsBugReportOpen(true)}
                            className="hidden sm:inline-flex text-sm text-slate-400 hover:text-slate-100 px-3 py-2 transition-colors"
                        >
                            Reportar un problema
                        </button>
                        {user ? (
                            <Link to="/dashboard" className="btn-primary !py-2 !px-4 text-sm">Abrir app</Link>
                        ) : (
                            <>
                                <Link to="/login" className="text-sm font-medium text-slate-300 hover:text-fg px-3 py-2 transition-colors">Iniciar sesión</Link>
                                <Link to="/register" className="btn-primary !py-2 !px-4 text-sm">Crear cuenta</Link>
                            </>
                        )}
                    </div>
                </div>
            </nav>

            {/* Hero */}
            <section className="max-w-6xl mx-auto px-5 pt-12 pb-20 lg:pt-20 grid lg:grid-cols-2 gap-14 items-center">
                <div className="text-center lg:text-left animate-slide-up">
                    <span className="inline-flex items-center gap-2 rounded-full glass px-3 py-1 text-xs font-medium text-slate-300 mb-6">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                        Mensajería en tiempo real
                    </span>
                    <h1 className="text-4xl sm:text-5xl xl:text-[3.5rem] font-extrabold tracking-tight leading-[1.08] text-balance">
                        Conecta con quien importa,{' '}
                        <span className="text-gradient">al instante.</span>
                    </h1>
                    <p className="mt-6 text-lg text-slate-400 max-w-xl mx-auto lg:mx-0 leading-relaxed">
                        Chatea, envía notas de voz, comparte archivos y haz videollamadas con tus
                        contactos y grupos. Rápido, seguro y desde cualquier dispositivo.
                    </p>
                    <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
                        {user ? (
                            <Link to="/dashboard" className="btn-primary text-base">Ir a mis chats</Link>
                        ) : (
                            <>
                                <Link to="/register" className="btn-primary text-base">Empezar gratis</Link>
                                <Link to="/login" className="btn-secondary text-base">Ya tengo cuenta</Link>
                            </>
                        )}
                    </div>
                </div>
                <AppMockup />
            </section>

            {/* Características */}
            <section className="max-w-6xl mx-auto px-5 py-20">
                <div className="text-center mb-14">
                    <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Todo lo que necesitas para hablar</h2>
                    <p className="mt-3 text-slate-400">Pensado para que la conversación fluya.</p>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {FEATURES.map(f => (
                        <div key={f.title} className="glass rounded-2xl p-6 hover:border-indigo-500/30 hover:-translate-y-0.5 transition-all">
                            <div className="w-11 h-11 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-300 mb-4">
                                <f.Icon className="w-6 h-6" />
                            </div>
                            <h3 className="font-semibold text-lg mb-1.5">{f.title}</h3>
                            <p className="text-sm text-slate-400 leading-relaxed">{f.description}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* Pasos */}
            <section className="max-w-6xl mx-auto px-5 py-20">
                <div className="text-center mb-14">
                    <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Empieza en 3 pasos</h2>
                </div>
                <div className="grid md:grid-cols-3 gap-4">
                    {STEPS.map((step, i) => (
                        <div key={step.title} className="relative glass rounded-2xl p-6">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-slate-950 font-bold flex items-center justify-center mb-4">{i + 1}</div>
                            <h3 className="font-semibold text-lg mb-1">{step.title}</h3>
                            <p className="text-sm text-slate-400">{step.text}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* CTA final */}
            <section className="max-w-6xl mx-auto px-5 pb-20">
                <div className="relative overflow-hidden rounded-3xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/15 via-slate-900 to-purple-500/15 p-10 sm:p-14 text-center">
                    <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">¿Listo para empezar?</h2>
                    <p className="mt-3 text-slate-300">Crea tu cuenta gratis y empieza a conversar hoy mismo.</p>
                    <Link to={user ? '/dashboard' : '/register'} className="btn-primary mt-8 text-base">
                        {user ? 'Abrir la app' : 'Crear mi cuenta'}
                    </Link>
                </div>
            </section>

            <footer className="border-t border-fg/[0.06]">
                <div className="max-w-6xl mx-auto px-5 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-500">
                    <div className="flex items-center gap-2">
                        <img src="/todos.svg" alt="" className="w-6 h-6" />
                        <span>© {new Date().getFullYear()} todos</span>
                    </div>
                    <button onClick={() => setIsBugReportOpen(true)} className="hover:text-slate-300 transition-colors">
                        Reportar un problema
                    </button>
                </div>
            </footer>

            <BugReportModal
                isOpen={isBugReportOpen}
                onClose={() => setIsBugReportOpen(false)}
            />
        </div>
    );
}
