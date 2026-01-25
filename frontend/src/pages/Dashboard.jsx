import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';

export default function Dashboard() {
    const { user, logout, updateUsername } = useAuth();
    const [profile, setProfile] = useState(null);
    const [error, setError] = useState('');
    const [showProfile, setShowProfile] = useState(false);
    const [showEdit, setShowEdit] = useState(false);
    const [newUsername, setNewUsername] = useState('');
    const [status, setStatus] = useState('');
    const [contacts, setContacts] = useState([]);
    const [selected, setSelected] = useState(null);
    const [numberInput, setNumberInput] = useState('');
    const [addMsg, setAddMsg] = useState('');
    const [showAdd, setShowAdd] = useState(false);
    const [showSearch, setShowSearch] = useState(false);
    const [drafts, setDrafts] = useState({});
    const [messagesByChat, setMessagesByChat] = useState({});

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const { data } = await api.get('/api/v1/user');
                setProfile(data);
            } catch {
                setError('No se pudo cargar el perfil');
            }
        };
        fetchProfile();
    }, []);

    useEffect(() => {
        const fetchContacts = async () => {
            try {
                const { data } = await api.get('/api/v1/contact');
                setContacts(Array.isArray(data) ? data : []);
            } catch (e) {
                setAddMsg('No se pudo cargar contactos');
            }
        };
        fetchContacts();
    }, []);

    const toggleProfile = () => setShowProfile((v) => !v);
    const openEdit = () => {
        setNewUsername(user?.username || '');
        setShowEdit(true);
        setStatus('');
    };
    const getChatKey = (contact) => {
        if (!contact) return '';
        return `${contact.Username || ''}-${contact.Number || ''}`;
    };
    const currentDraft = selected ? drafts[getChatKey(selected)] || '' : '';
    const handleInputChange = (e) => {
        if (!selected) return;
        const key = getChatKey(selected);
        const value = e.target.value;
        setDrafts((prev) => ({
            ...prev,
            [key]: value,
        }));
    };
    const handleSend = () => {
        if (!selected) return;
        const trimmed = currentDraft.trim();
        if (!trimmed) return;
        const key = getChatKey(selected);
        setMessagesByChat((prev) => {
            const prevMsgs = prev[key] || [];
            return {
                ...prev,
                [key]: [...prevMsgs, { from: 'me', text: trimmed }],
            };
        });
        setDrafts((prev) => ({
            ...prev,
            [key]: '',
        }));
    };
    const submitEdit = async (e) => {
        e.preventDefault();
        try {
            await api.put('/api/v1/user', { username: newUsername });
            updateUsername(newUsername);
            const { data } = await api.get('/api/v1/user');
            setProfile(data);
            setShowEdit(false);
            setStatus('Nombre actualizado');
        } catch (err) {
            const d = err?.response?.data;
            const msg = typeof d === 'string' ? d : d?.message || d?.error || err?.message || 'Error al actualizar';
            setStatus(msg);
        }
    };
    const submitAddContact = async (e) => {
        e.preventDefault();
        setAddMsg('');
        const n = numberInput.trim();
        if (n.length !== 8) {
            setAddMsg('El número debe tener 8 dígitos');
            return;
        }
        try {
            const { data } = await api.post('/api/v1/contact', JSON.stringify(n));
            const created = data?.['contacto creado'];
            if (created) {
                setContacts((prev) => [created, ...prev]);
                try {
                    const { data: refreshed } = await api.get('/api/v1/contact');
                    setContacts(Array.isArray(refreshed) ? refreshed : []);
                } catch {}
                setNumberInput('');
                setAddMsg('Contacto creado');
            } else {
                setAddMsg('Contacto creado');
            }
        } catch (err) {
            const d = err?.response?.data;
            const msg = typeof d === 'string' ? d : d?.message || d?.error || 'Error al agregar';
            if (typeof msg === 'string' && msg.toLowerCase().includes('contacto ya existente')) {
                try {
                    const { data: refreshed } = await api.get('/api/v1/contact');
                    setContacts(Array.isArray(refreshed) ? refreshed : []);
                } catch {}
                setAddMsg('Contacto creado');
            } else {
                setAddMsg(msg);
            }
        }
    };

    return (
        <div className="flex h-screen bg-gradient-to-br from-purple-950 via-indigo-950 to-gray-950 text-white overflow-hidden">
            {/* Sidebar */}
            <div className="w-72 bg-white/10 backdrop-blur-xl border-r border-white/10 flex flex-col">
                <div className="p-5 border-b border-white/10 flex justify-between items-center">
                    <h1 className="text-xl font-bold">ApiChat</h1>
                    <div className="w-3 h-3 bg-green-500 rounded-full" title="Conectado"></div>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4">
                    <div className="text-indigo-200 text-sm mb-2 uppercase">Contactos</div>
                    <div>
                        {contacts.map((c, idx) => (
                            <button
                                key={idx}
                                onClick={() => setSelected(c)}
                                className={`w-full text-left p-3 bg-white/5 hover:bg-white/10 rounded mb-2 flex items-center gap-3 ${selected?.Username === c.Username ? 'ring-1 ring-indigo-400' : ''}`}
                            >
                                <div className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center text-sm">
                                    {c.Username?.charAt(0)?.toUpperCase()}
                                </div>
                                <div className="flex-1">
                                    <div className="font-medium">{c.Username}</div>
                                    <div className="text-xs text-indigo-200">{c.Number}</div>
                                </div>
                                {c.Status === 'pending' && (
                                    <span className="text-xs px-2 py-1 rounded bg-yellow-500/20 text-yellow-300">pendiente</span>
                                )}
                            </button>
                        ))}
                        {contacts.length === 0 && (
                            <div className="text-sm text-indigo-300">Sin contactos</div>
                        )}
                    </div>
                    <div className="mt-2 flex gap-2">
                        <button
                            onClick={() => { setShowAdd(true); setAddMsg(''); }}
                            className="flex-1 bg-white/10 hover:bg-white/20 text-indigo-200 py-2 rounded text-sm transition"
                        >
                            Añadir
                        </button>
                        <button
                            onClick={() => setShowSearch(true)}
                            className="flex-1 bg-white/10 hover:bg-white/20 text-indigo-200 py-2 rounded text-sm transition"
                        >
                            Buscar
                        </button>
                    </div>
                </div>

                <div className="p-4 bg-white/10 border-t border-white/10">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 bg-gradient-to-tr from-purple-600 to-indigo-600 rounded-full flex items-center justify-center font-bold">
                            {user?.username?.charAt(0).toUpperCase()}
                        </div>
                        <div className="overflow-hidden">
                            <div className="font-bold truncate">{user?.username}</div>
                            <div className="text-xs text-green-400">En línea</div>
                            {error && <div className="text-xs text-red-400">{error}</div>}
                            {showProfile && profile && (
                                <div className="mt-2 text-xs text-indigo-100">
                                    <div className="truncate">Email: {profile.Gmail}</div>
                                    <div className="truncate">Número: {profile.Telephon}</div>
                                </div>
                            )}
                        </div>
                    </div>
                    {status && <div className="text-xs text-indigo-200 mb-2">{status}</div>}
                    <div className="flex gap-2 mb-3">
                        <button
                            onClick={toggleProfile}
                            className="flex-1 bg-white/10 hover:bg-white/20 text-indigo-200 py-2 rounded text-sm transition"
                        >
                            {showProfile ? 'Ocultar Perfil' : 'Ver Perfil'}
                        </button>
                        <button
                            onClick={openEdit}
                            className="flex-1 bg-indigo-600/30 hover:bg-indigo-600/50 text-white py-2 rounded text-sm transition"
                        >
                            Editar Perfil
                        </button>
                    </div>
                    <button 
                        onClick={logout}
                        className="w-full bg-red-600/20 text-red-300 hover:bg-red-600/40 py-2 rounded text-sm transition"
                    >
                        Cerrar Sesión
                    </button>
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 flex flex-col">
                {!selected ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-indigo-200 p-8 text-center">
                        <div className="w-24 h-24 bg-white/10 rounded-full flex items-center justify-center mb-6">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                        </div>
                        <h2 className="text-3xl font-bold mb-2">Bienvenido a ApiChat</h2>
                        <p className="max-w-md text-indigo-300">
                            Selecciona un contacto para comenzar a chatear. 
                            <br/>
                            <span className="text-sm opacity-70">(Funcionalidad de chat y WebSockets en desarrollo)</span>
                        </p>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col">
                        <div className="p-4 border-b border-white/10 bg-white/5 flex items-center gap-3">
                            <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center">
                                {selected.Username?.charAt(0)?.toUpperCase()}
                            </div>
                            <div className="flex-1">
                                <div className="font-bold">{selected.Username}</div>
                                <div className="text-xs text-indigo-300">{selected.Number}</div>
                            </div>
                            {selected.Status === 'pending' && (
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setShowSearch(true)}
                                        className="px-3 py-1 rounded bg-green-600/30 text-green-200"
                                    >
                                        Yes
                                    </button>
                                    <button
                                        onClick={() => setShowSearch(true)}
                                        className="px-3 py-1 rounded bg-red-600/30 text-red-200"
                                    >
                                        No
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="flex-1 flex flex-col text-indigo-200 p-4 space-y-3 overflow-y-auto">
                            {(messagesByChat[getChatKey(selected)] || []).length === 0 ? (
                                <div className="flex-1 flex items-center justify-center">
                                    <div className="text-center">
                                        <div className="text-sm">El chat estará disponible pronto</div>
                                    </div>
                                </div>
                            ) : (
                                (messagesByChat[getChatKey(selected)] || []).map((m, idx) => (
                                    <div
                                        key={idx}
                                        className={`flex ${m.from === 'me' ? 'justify-end' : 'justify-start'}`}
                                    >
                                        <div
                                            className={`max-w-xs px-3 py-2 rounded-2xl text-sm ${
                                                m.from === 'me'
                                                    ? 'bg-indigo-600 text-white rounded-br-none'
                                                    : 'bg-white/10 text-indigo-100 rounded-bl-none'
                                            }`}
                                        >
                                            {m.text}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}

                <div className="p-4 bg-white/10 border-t border-white/10">
                    <div className="flex gap-4">
                        <input 
                            type="text" 
                            value={currentDraft}
                            onChange={handleInputChange}
                            placeholder={selected ? "Escribe un mensaje..." : "Selecciona un contacto para escribir"}
                            className={`flex-1 p-3 rounded bg-white/5 border border-white/10 focus:outline-none ${selected ? '' : 'cursor-not-allowed opacity-50'}`}
                            disabled={!selected}
                        />
                        <button
                            className={`bg-gradient-to-r from-purple-600 to-indigo-600 px-6 rounded ${selected && currentDraft.trim() ? '' : 'opacity-50 cursor-not-allowed'}`}
                            disabled={!selected || !currentDraft.trim()}
                            onClick={handleSend}
                        >
                            Enviar
                        </button>
                    </div>
                </div>
            </div>
            {showAdd && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
                    <div className="w-full max-w-sm bg-white/10 border border-white/20 rounded-xl p-6">
                        <h3 className="text-lg font-bold mb-3">Añadir contacto por número</h3>
                        <form onSubmit={submitAddContact} className="space-y-4">
                            <input
                                type="text"
                                value={numberInput}
                                onChange={(e) => setNumberInput(e.target.value)}
                                className="w-full p-3 rounded bg-white/5 border border-white/10 focus:outline-none"
                                placeholder="Número (8 dígitos)"
                            />
                            {addMsg && <div className="text-xs text-indigo-200">{addMsg}</div>}
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setShowAdd(false)}
                                    className="flex-1 bg-white/10 hover:bg-white/20 text-indigo-200 py-2 rounded"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white py-2 rounded"
                                >
                                    Añadir
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {showSearch && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
                    <div className="w-full max-w-sm bg-white/10 border border-white/20 rounded-xl p-6">
                        <h3 className="text-lg font-bold mb-3">Buscar contactos</h3>
                        <div className="text-sm text-indigo-200 mb-4">Próximamente...</div>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setShowSearch(false)}
                                className="flex-1 bg-white/10 hover:bg-white/20 text-indigo-200 py-2 rounded"
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {showEdit && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
                    <div className="w-full max-w-sm bg-white/10 border border-white/20 rounded-xl p-6">
                        <h3 className="text-lg font-bold mb-3">Editar nombre de perfil</h3>
                        <form onSubmit={submitEdit} className="space-y-4">
                            <input
                                type="text"
                                value={newUsername}
                                onChange={(e) => setNewUsername(e.target.value)}
                                className="w-full p-3 rounded bg-white/5 border border-white/10 focus:outline-none"
                                placeholder="Nuevo nombre"
                            />
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setShowEdit(false)}
                                    className="flex-1 bg-white/10 hover:bg-white/20 text-indigo-200 py-2 rounded"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white py-2 rounded"
                                >
                                    Guardar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
