import { Link } from 'react-router-dom'

export default function AuthLayout({ children, title, subtitle, footer }) {
  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-purple-900 via-indigo-900 to-gray-900" style={{height: '100vh', overflow: 'auto'}}>
      <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-purple-600/20 blur-3xl rounded-full" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-indigo-600/20 blur-3xl rounded-full" />
      </div>
      <div className="flex items-start justify-center p-3 py-4 min-h-full">
        <div className="w-full max-w-md my-4">
          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl">
            <div className="px-6 pt-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-500 to-indigo-500 flex items-center justify-center text-white font-bold text-sm">T</div>
                <div>
                  <div className="text-white font-bold text-base">todos</div>
                  <div className="text-indigo-300 text-xs">Conecta y conversa</div>
                </div>
              </div>
              <h1 className="text-lg font-bold text-white">{title}</h1>
              {subtitle && <p className="text-indigo-200 mt-1 text-xs">{subtitle}</p>}
            </div>
            <div className="px-6 py-3">{children}</div>
            {footer && (
              <div className="px-6 pb-4 pt-2 border-t border-white/10">
                <div className="text-center text-xs text-indigo-200">
                  {footer}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
