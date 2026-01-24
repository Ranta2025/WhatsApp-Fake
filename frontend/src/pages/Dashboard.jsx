import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
    const { user, logout } = useAuth();

    return (
        <div className="flex h-screen bg-gray-900 text-white overflow-hidden">
            {/* Sidebar */}
            <div className="w-64 bg-gray-800 flex flex-col border-r border-gray-700">
                <div className="p-4 border-b border-gray-700 flex justify-between items-center">
                    <h1 className="text-xl font-bold">ApiChat</h1>
                    <div className="w-3 h-3 bg-green-500 rounded-full" title="Conectado"></div>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4">
                    <div className="text-gray-400 text-sm mb-2 uppercase">Contactos</div>
                    {/* Placeholder para contactos */}
                    <div className="opacity-50 cursor-not-allowed">
                        <div className="p-3 bg-gray-700/50 rounded mb-2 flex items-center gap-3">
                            <div className="w-8 h-8 bg-gray-600 rounded-full"></div>
                            <div>
                                <div className="font-medium">Juan Perez</div>
                                <div className="text-xs text-gray-400">Próximamente...</div>
                            </div>
                        </div>
                        <div className="p-3 bg-gray-700/50 rounded mb-2 flex items-center gap-3">
                            <div className="w-8 h-8 bg-gray-600 rounded-full"></div>
                            <div>
                                <div className="font-medium">Maria Garcia</div>
                                <div className="text-xs text-gray-400">Próximamente...</div>
                            </div>
                        </div>
                    </div>
                    <button className="w-full mt-4 py-2 border border-dashed border-gray-600 text-gray-400 rounded hover:bg-gray-700 cursor-not-allowed opacity-50">
                        + Añadir Contacto
                    </button>
                </div>

                <div className="p-4 bg-gray-800 border-t border-gray-700">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center font-bold">
                            {user?.username?.charAt(0).toUpperCase()}
                        </div>
                        <div className="overflow-hidden">
                            <div className="font-bold truncate">{user?.username}</div>
                            <div className="text-xs text-green-400">En línea</div>
                        </div>
                    </div>
                    <button 
                        onClick={logout}
                        className="w-full bg-red-600/20 text-red-400 hover:bg-red-600/40 py-2 rounded text-sm transition"
                    >
                        Cerrar Sesión
                    </button>
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 flex flex-col bg-gray-900">
                <div className="flex-1 flex flex-col items-center justify-center text-gray-500 p-8 text-center">
                    <div className="w-24 h-24 bg-gray-800 rounded-full flex items-center justify-center mb-6">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-bold mb-2">Bienvenido a ApiChat</h2>
                    <p className="max-w-md">
                        Selecciona un contacto para comenzar a chatear. 
                        <br/>
                        <span className="text-sm opacity-70">(Funcionalidad de chat y WebSockets en desarrollo)</span>
                    </p>
                </div>

                {/* Input Area (Disabled) */}
                <div className="p-4 bg-gray-800 border-t border-gray-700">
                    <div className="flex gap-4">
                        <input 
                            type="text" 
                            disabled
                            placeholder="Escribe un mensaje... (Deshabilitado)" 
                            className="flex-1 p-3 rounded bg-gray-700 border border-gray-600 focus:outline-none cursor-not-allowed opacity-50"
                        />
                        <button disabled className="bg-blue-600 px-6 rounded opacity-50 cursor-not-allowed">
                            Enviar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
