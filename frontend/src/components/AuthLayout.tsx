import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BoltIcon, PhoneIcon, LockIcon } from './ui/icons';

const FEATURES = [
    { Icon: BoltIcon, title: 'Tiempo real', text: 'Mensajes, confirmaciones de lectura y "escribiendo…" al instante.' },
    { Icon: PhoneIcon, title: 'Voz y video', text: 'Llamadas y videollamadas con un toque.' },
    { Icon: LockIcon, title: 'Privado', text: 'Sesiones seguras y verificación por correo.' },
];

/** Vista previa decorativa de una conversación (panel de marca) */
const ChatPreview = () => (
    <div className="glass rounded-3xl p-5 w-full max-w-sm shadow-2xl shadow-black/40 space-y-3">
        <div className="flex items-center gap-3 pb-3 border-b border-fg/[0.06]">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-500 to-rose-500 flex items-center justify-center text-sm font-semibold">L</div>
            <div>
                <div className="text-sm font-semibold">Laura</div>
                <div className="text-[11px] text-indigo-400">escribiendo…</div>
            </div>
        </div>
        <div className="flex justify-start">
            <div className="bg-slate-800 rounded-2xl rounded-bl-md px-3.5 py-2 text-sm max-w-[80%]">¿Nos vemos a las 8? 🎉</div>
        </div>
        <div className="flex justify-end">
            <div className="bg-indigo-700 text-on-accent rounded-2xl rounded-br-md px-3.5 py-2 text-sm max-w-[80%]">¡Perfecto! Te llamo al salir 📞</div>
        </div>
        <div className="flex justify-start">
            <div className="bg-slate-800 rounded-2xl rounded-bl-md px-3.5 py-2 text-sm flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" />
            </div>
        </div>
    </div>
);

interface AuthLayoutProps {
    children: ReactNode;
    title: ReactNode;
    subtitle?: ReactNode;
    footer?: ReactNode | (() => ReactNode);
    backTo?: string;
    backLabel?: string;
}

export default function AuthLayout({ children, title, subtitle, footer, backTo = '/', backLabel = 'Inicio' }: AuthLayoutProps) {
    return (
        <div className="h-full w-full overflow-y-auto hero-surface text-slate-100">
            <div className="min-h-full grid lg:grid-cols-[1.05fr_1fr]">
                {/* Panel de marca (escritorio) */}
                <aside className="hidden lg:flex flex-col justify-between p-12 xl:p-16 border-r border-fg/[0.05] relative overflow-hidden">
                    <Link to="/" className="flex items-center gap-2.5 w-fit">
                        <img src="/todos.svg" alt="" className="w-9 h-9" />
                        <span className="text-lg font-bold tracking-tight">todos</span>
                    </Link>

                    <div className="space-y-10 max-w-lg">
                        <h1 className="text-4xl xl:text-5xl font-extrabold tracking-tight leading-[1.1]">
                            Habla con los tuyos,{' '}
                            <span className="text-gradient">sin esperas.</span>
                        </h1>
                        <ChatPreview />
                        <ul className="space-y-4">
                            {FEATURES.map(f => (
                                <li key={f.title} className="flex gap-3">
                                    <span className="w-9 h-9 rounded-xl bg-fg/[0.05] border border-fg/[0.06] flex items-center justify-center flex-shrink-0 text-indigo-300">
                                        <f.Icon />
                                    </span>
                                    <div>
                                        <div className="font-semibold text-sm">{f.title}</div>
                                        <div className="text-sm text-slate-400">{f.text}</div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <p className="text-xs text-slate-500">© {new Date().getFullYear()} todos</p>
                </aside>

                {/* Formulario */}
                <main className="flex flex-col px-5 py-8 sm:px-10">
                    <div className="flex items-center justify-between">
                        <Link to={backTo} className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-100 transition-colors">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                            </svg>
                            {backLabel}
                        </Link>
                        <Link to="/" className="lg:hidden flex items-center gap-2">
                            <img src="/todos.svg" alt="" className="w-7 h-7" />
                            <span className="font-bold tracking-tight">todos</span>
                        </Link>
                    </div>

                    <div className="flex-1 flex flex-col justify-center py-10">
                        <div className="w-full max-w-md mx-auto animate-slide-up">
                            <div className="mb-8">
                                <h2 className="text-3xl font-bold tracking-tight">{title}</h2>
                                {subtitle && <p className="mt-2 text-slate-400">{subtitle}</p>}
                            </div>

                            <div className="glass rounded-2xl p-6 sm:p-8 shadow-2xl shadow-black/30">
                                {children}
                            </div>

                            {footer && (
                                <div className="mt-6 text-center text-sm text-slate-400">
                                    {typeof footer === 'function' ? footer() : footer}
                                </div>
                            )}
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}
