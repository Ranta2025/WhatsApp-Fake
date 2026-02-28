import { Link } from 'react-router-dom'

export default function AuthLayout({ children, title, subtitle, footer }) {
  return (
    <div className="h-full w-full bg-slate-950 text-slate-100 overflow-y-auto">
      <div className="min-h-full flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 mb-4">
                <img src="/todos.svg" alt="todos" className="w-10 h-10" />
            </div>
        </div>
        <h2 className="mt-2 text-center text-3xl font-bold tracking-tight text-white">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-2 text-center text-sm text-slate-400">
            {subtitle}
          </p>
        )}
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-slate-900 py-8 px-4 shadow-xl sm:rounded-xl border border-white/5 sm:px-10">
          {children}
          
          {footer && (
            <div className="mt-6 border-t border-white/5 pt-6">
                <div className="text-center text-sm text-slate-400">
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
