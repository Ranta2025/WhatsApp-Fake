import { Link } from 'react-router-dom';

export default function AuthLayout({ children, title, subtitle, footer }) {
  return (
    <div className="relative min-h-[100dvh] w-full overflow-x-hidden overflow-y-auto bg-[#020617] text-slate-100">
      {/* Fondo sutil */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_top,rgba(14,165,233,0.08),transparent_60%)]" />
        <div className="absolute -left-32 top-20 h-64 w-64 rounded-full bg-sky-500/[0.03] blur-3xl" />
        <div className="absolute right-0 top-32 h-80 w-80 rounded-full bg-indigo-500/[0.03] blur-3xl" />
      </div>

      {/* Header móvil */}
      <div className="relative flex items-center justify-between px-6 py-5 lg:hidden">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600">
            <img src="/todos.svg" alt="todos" className="h-5 w-5" />
          </div>
          <span className="text-lg font-bold text-white">todos</span>
        </Link>
      </div>

      <div className="relative mx-auto flex min-h-[calc(100dvh-80px)] w-full max-w-6xl flex-col justify-center px-4 py-6 sm:px-6 lg:min-h-[100dvh] lg:px-8 lg:py-12">
        <div className="grid items-center gap-10 lg:min-h-[calc(100dvh-6rem)] lg:grid-cols-[1fr_0.9fr] lg:gap-16">
          {/* Lado izquierdo - Branding */}
          <section className="hidden lg:block">
            <div className="max-w-lg space-y-8">
              <Link to="/" className="inline-flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 shadow-lg shadow-sky-500/10">
                  <img src="/todos.svg" alt="todos" className="h-6 w-6" />
                </div>
                <span className="text-2xl font-bold text-white">todos</span>
              </Link>

              <div className="space-y-4">
                <h1 className="text-[2.75rem] font-bold leading-[1.15] tracking-tight text-white">
                  Conversaciones claras, <span className="text-sky-400">conexiones reales</span>.
                </h1>
                <p className="max-w-md text-base leading-relaxed text-slate-400">
                  Una plataforma diseñada para que comunicarte sea natural, rápido y sin distracciones.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-sky-400/80">Mensajes</div>
                  <p className="mt-2 text-sm text-slate-400 leading-relaxed">Rápidos y organizados</p>
                </div>
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-emerald-400/80">Llamadas</div>
                  <p className="mt-2 text-sm text-slate-400 leading-relaxed">Voz y video nítidos</p>
                </div>
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-amber-400/80">Privacidad</div>
                  <p className="mt-2 text-sm text-slate-400 leading-relaxed">Siempre protegida</p>
                </div>
              </div>
            </div>
          </section>

          {/* Lado derecho - Formulario */}
          <section className="w-full">
            <div className="mx-auto w-full max-w-md">
              <div className="rounded-2xl border border-white/[0.06] bg-[#0B1120] p-6 shadow-card sm:p-8">
                <div className="mb-8 text-center">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500/20 to-indigo-500/20 ring-1 ring-white/10">
                    <img src="/todos.svg" alt="todos" className="h-7 w-7" />
                  </div>
                  <h2 className="text-2xl font-bold tracking-tight text-white">{title}</h2>
                  {subtitle && (
                    <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-400">
                      {subtitle}
                    </p>
                  )}
                </div>

                {children}

                {footer && (
                  <div className="mt-8 border-t border-white/[0.06] pt-6">
                    <div className="text-center text-sm text-slate-400">
                      {footer}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
