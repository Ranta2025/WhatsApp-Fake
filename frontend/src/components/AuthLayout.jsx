import { Link } from 'react-router-dom'

export default function AuthLayout({ children, title, subtitle, footer }) {
  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900" style={{height: '100vh', overflow: 'auto'}}>
      <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-purple-600/20 blur-3xl rounded-full" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-indigo-600/20 blur-3xl rounded-full" />
      </div>
      <div className="flex items-start justify-center p-3 py-4 min-h-full">
        <div className="w-full max-w-md my-4">
          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl">
            <div className="px-6 pt-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center"><img src="/todos.svg" alt="todos" className="w-10 h-10" /></div>
                <div>
                  <div className="text-white font-bold text-lg">todos</div>
                  <div className="text-indigo-300 text-sm">Conecta y conversa</div>
                </div>
              </div>
              <h1 className="text-2xl font-bold text-white">{title}</h1>
              {subtitle && <p className="text-indigo-200 mt-2 text-sm">{subtitle}</p>}
            </div>
            <div className="px-6 py-6">{children}</div>
            {footer && (
              <div className="px-6 pb-6 pt-4 border-t border-white/10">
                <div className="text-center text-sm text-indigo-200">
                  {typeof footer === 'function' ? footer() : footer}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
