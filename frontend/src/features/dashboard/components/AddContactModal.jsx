import React, { useState } from 'react';
import api from '../../../api/axios';
import { useDashboard } from '../context/DashboardContext';

const AddContactModal = ({ isOpen, onClose, initialNumber = '', initialName = '' }) => {
    const { setContacts, setSelected, setAllChatGroups, setSidebarView, setSidebarOpen, fetchContacts } = useDashboard();
    const [numberInput, setNumberInput] = useState(initialNumber);
    const [contactNameInput, setContactNameInput] = useState(initialName);
    const [addMsg, setAddMsg] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // Actualizar campos cuando cambian las props (al abrir desde el banner del chat)
    React.useEffect(() => {
        if (isOpen) {
            setNumberInput(initialNumber);
            setContactNameInput(initialName);
            setAddMsg('');
        }
    }, [isOpen, initialNumber, initialName]);

    if (!isOpen) return null;

    const submitAddContact = async (e) => {
        e.preventDefault();
        setAddMsg('');
        const n = numberInput.trim();
        const cn = contactNameInput.trim();

        if (!n.match(/^\+[1-9]\d{6,14}$/)) {
            setAddMsg('El número debe estar en formato internacional (ej: +50212345678)');
            return;
        }
        if (!cn) {
            setAddMsg('Debes ingresar un nombre para el contacto');
            return;
        }

        setIsLoading(true);
        try {
            const { data } = await api.post('/api/v1/contact', { number: n, contact_name: cn });
            const created = data?.contact || data?.['contacto creado'];
            
            if (created) {
                setContacts(prev => [created, ...prev]);
                setAllChatGroups(prev => ({
                    ...prev,
                    [n]: { ...prev[n], IsContact: true, ContactName: cn }
                }));
                
                setAddMsg('Contacto creado exitosamente');
                setTimeout(() => {
                    setSelected(created);
                    setSidebarView('chats');
                    setSidebarOpen(false);
                    onClose();
                    setNumberInput('');
                    setContactNameInput('');
                    setAddMsg('');
                    setIsLoading(false);
                    fetchContacts(); // Refrescar contactos para actualizar avatarMap
                }, 1000);
            } else {
                setIsLoading(false);
            }
        } catch (err) {
            const d = err?.response?.data;
            const msg = typeof d === 'string' ? d : d?.message || d?.error || 'Error al agregar';
            setAddMsg(msg);
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-700/50">
                <div className="p-6 border-b border-slate-700/50 flex justify-between items-center bg-slate-800/50">
                    <h2 className="text-xl font-semibold text-slate-100">Añadir Contacto</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-200 p-2 hover:bg-slate-700/50 rounded-lg">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <form onSubmit={submitAddContact} className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Nombre</label>
                        <input
                            type="text"
                            value={contactNameInput}
                            onChange={(e) => setContactNameInput(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl bg-slate-900/50 border border-slate-700 focus:border-indigo-500 text-slate-100 placeholder-slate-500 focus:outline-none"
                            placeholder="Ej: Juan Pérez"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Número de teléfono</label>
                        <input
                            type="text"
                            value={numberInput}
                            onChange={(e) => setNumberInput(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl bg-slate-900/50 border border-slate-700 focus:border-indigo-500 text-slate-100 placeholder-slate-500 focus:outline-none"
                            placeholder="Ej: +50212345678"
                        />
                    </div>
                    {addMsg && (
                        <div className={`text-sm ${addMsg.includes('exitosamente') ? 'text-green-400' : 'text-red-400'}`}>
                            {addMsg}
                        </div>
                    )}
                    <div className="flex gap-3 pt-4 border-t border-slate-700/50">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2.5 rounded-xl font-medium text-slate-300 bg-slate-700/50 hover:bg-slate-700 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="flex-1 px-4 py-2.5 rounded-xl font-medium text-white bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-500/20 transition-all active:scale-[0.98]"
                        >
                            {isLoading ? 'Añadiendo...' : 'Añadir'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AddContactModal;
