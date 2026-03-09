export default function AuthLayout({ children, title, subtitle, footer }) {
  return (
    <div className="relative min-h-[100dvh] w-full overflow-x-hidden overflow-y-auto bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.18),transparent_58%)]" />
        <div className="absolute -left-20 top-24 h-64 w-64 rounded-full bg-amber-400/10 blur-3xl" />
        <div className="absolute right-0 top-40 h-80 w-80 rounded-full bg-sky-500/10 blur-3xl" />
        <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:28px_28px]" />
      </div>

      <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-6xl flex-col justify-start px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
        <div className="grid items-start gap-8 lg:min-h-[calc(100dvh-6rem)] lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-12">
          <section className="hidden lg:block">
            <div className="max-w-xl space-y-6">
              <div className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 backdrop-blur-md">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-400/20 ring-1 ring-sky-300/30">
                  <img src="/todos.svg" alt="todos" className="h-5 w-5" />
                </span>
                Conversaciones, grupos y llamadas en un solo lugar
              </div>

              <div className="space-y-4">
                <h1 className="text-4xl font-black tracking-tight text-white xl:text-5xl">
                  Empieza tu conversación con una experiencia clara, ágil y confiable.
                </h1>
                <p className="max-w-lg text-base leading-7 text-slate-300">
                  Diseñamos cada acceso para que transmitir confianza sea tan importante como entrar rápido.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
                  <div className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-300/80">Mensajes</div>
                  <div className="mt-2 text-2xl font-bold text-white">Ágil</div>
                  <p className="mt-1 text-sm text-slate-400">Responde, organiza y retoma conversaciones sin perder el ritmo.</p>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
                  <div className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300/80">Llamadas</div>
                  <div className="mt-2 text-2xl font-bold text-white">Cercano</div>
                  <p className="mt-1 text-sm text-slate-400">Voz y video con una interfaz simple, humana y fácil de usar.</p>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
                  <div className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-300/80">Privacidad</div>
                  <div className="mt-2 text-2xl font-bold text-white">Confiable</div>
                  <p className="mt-1 text-sm text-slate-400">Tu cuenta y tu información siempre bajo control, sin complicaciones.</p>
                </div>
              </div>
            </div>
          </section>

          <section className="sm:mx-auto sm:w-full sm:max-w-md lg:max-w-none lg:self-center">
            <div className="rounded-[2rem] border border-white/10 bg-slate-900/80 p-4 shadow-[0_32px_120px_-40px_rgba(15,23,42,0.95)] backdrop-blur-xl sm:p-6">
              <div className="rounded-[1.75rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] px-5 py-6 sm:px-7 sm:py-8">
                <div className="mb-7 text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-[linear-gradient(135deg,rgba(56,189,248,0.22),rgba(251,191,36,0.18))] ring-1 ring-white/10">
                    <img src="/todos.svg" alt="todos" className="h-9 w-9" />
                  </div>
                  <h2 className="text-3xl font-black tracking-tight text-white">{title}</h2>
                  {subtitle && (
                    <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-400">
                      {subtitle}
                    </p>
                  )}
                </div>

                {children}

                {footer && (
                  <div className="mt-7 border-t border-white/10 pt-6">
                    <div className="text-center text-sm text-slate-400">
                      {typeof footer === 'function' ? footer() : footer}
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
