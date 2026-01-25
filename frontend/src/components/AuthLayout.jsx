import { Link } from 'react-router-dom'

export default function AuthLayout({ children, title, subtitle, footer }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-gray-900 flex items-center justify-center p-6">
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-purple-600/20 blur-3xl rounded-full" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-indigo-600/20 blur-3xl rounded-full" />
      </div>
      <div className="w-full max-w-md">
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl overflow-hidden">
          <div className="px-8 pt-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-500 to-indigo-500 flex items-center justify-center text-white font-bold">A</div>
              <div>
                <div className="text-white font-bold text-lg">ApiChat</div>
                <div className="text-indigo-300 text-xs">Conecta y conversa</div>
              </div>
            </div>
            <h1 className="text-2xl font-bold text-white">{title}</h1>
            {subtitle && <p className="text-indigo-200 mt-2">{subtitle}</p>}
          </div>
          <div className="px-8 py-6">{children}</div>
          <div className="px-8 pb-8">
            <div className="text-center text-sm text-indigo-200">
              {footer}
            </div>
            <div className="mt-4 text-center">
              <Link to="/" className="text-indigo-300 hover:text-white transition">Volver al inicio</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
