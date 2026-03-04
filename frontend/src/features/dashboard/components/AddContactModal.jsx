import React, { useState } from 'react';
import api from '../../../api/axios';
import { useDashboard } from '../context/DashboardContext';
import PhoneInput from 'react-phone-input-2';
import 'react-phone-input-2/lib/style.css';
import { validatePhone } from '../../../utils/phoneValidation';

const AddContactModal = ({ isOpen, onClose, initialNumber = '', initialName = '' }) => {
    const { setContacts, setSelected, setAllChatGroups, setSidebarView, setSidebarOpen, fetchContacts } = useDashboard();
    const [numberInput, setNumberInput] = useState(initialNumber);
    const [contactNameInput, setContactNameInput] = useState(initialName);
    const [addMsg, setAddMsg] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [phoneError, setPhoneError] = useState('');
    const [phoneLocalNumber, setPhoneLocalNumber] = useState('');
    const [phoneCountryIso, setPhoneCountryIso] = useState('cu');
    const [phoneDialCode, setPhoneDialCode] = useState('53');

    const buildPhoneE164 = (dialCode, localNumber) => {
        const codeDigits = String(dialCode || '').replace(/\D/g, '');
        const localDigits = String(localNumber || '').replace(/\D/g, '');
        if (!codeDigits && !localDigits) return '';
        return `+${codeDigits}${localDigits}`;
    };

    // Actualizar campos cuando cambian las props (al abrir desde el banner del chat)
    React.useEffect(() => {
        if (isOpen) {
            setNumberInput(initialNumber);
            setContactNameInput(initialName);
            setAddMsg('');
            setPhoneError('');
            setPhoneLocalNumber(initialNumber.replace(/^\+\d+/, '').replace(/\D/g, ''));
            setPhoneCountryIso('cu');
            setPhoneDialCode('53');
        }
    }, [isOpen, initialNumber, initialName]);

    if (!isOpen) return null;

    const submitAddContact = async (e) => {
        e.preventDefault();
        setAddMsg('');
        const cn = contactNameInput.trim();

        const phoneResult = validatePhone(numberInput);
        if (!phoneResult.valid) {
            setAddMsg(phoneResult.error);
            setPhoneError(phoneResult.error);
            return;
        }
        const n = phoneResult.formatted;
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
            <div className="bg-slate-800 rounded-2xl w-full max-w-md overflow-visible shadow-2xl border border-slate-700/50">
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
                        <div className="flex items-stretch gap-2">
                            <div className="relative w-[96px] h-[46px] shrink-0">
                                <PhoneInput
                                    country={phoneCountryIso}
                                    enableSearch={true}
                                    disableSearchIcon={true}
                                    searchPlaceholder="Buscar por país..."
                                    value={`+${phoneDialCode}`}
                                    onChange={(phone, countryData) => {
                                        const code = countryData?.dialCode || phoneDialCode;
                                        const iso = countryData?.countryCode || phoneCountryIso;
                                        setPhoneDialCode(code);
                                        setPhoneCountryIso(iso);
                                        const full = buildPhoneE164(code, phoneLocalNumber);
                                        setNumberInput(full);
                                    }}
                                    inputProps={{
                                        name: 'number',
                                        readOnly: true,
                                        tabIndex: -1,
                                    }}
                                    containerClass="react-tel-input !w-full !h-full"
                                    inputClass="!hidden"
                                    buttonClass="!absolute !inset-0 !w-full !h-full !bg-slate-900/50 !border !border-slate-700 !rounded-xl hover:!border-indigo-500"
                                    dropdownClass="!bg-slate-800 !border !border-slate-700 !text-slate-100 !rounded-xl"
                                    searchClass="!bg-slate-900 !border !border-slate-700 !text-slate-100 !rounded-lg"
                                    copyNumbersOnly={false}
                                    enableAreaCodeStretch
                                    countryCodeEditable={false}
                                    disableCountryCode={false}
                                    disableDropdown={false}
                                />
                                <div className="pointer-events-none absolute left-9 top-1/2 -translate-y-1/2 text-sm text-slate-200 font-medium">
                                    +{phoneDialCode}
                                </div>
                            </div>
                            <input
                                type="tel"
                                value={phoneLocalNumber}
                                onChange={(e) => {
                                    const local = e.target.value.replace(/\D/g, '');
                                    setPhoneLocalNumber(local);
                                    const full = buildPhoneE164(phoneDialCode, local);
                                    setNumberInput(full);
                                    if (full && full.length > 3) {
                                        const result = validatePhone(full);
                                        setPhoneError(result.valid ? '' : result.error);
                                    } else {
                                        setPhoneError('');
                                    }
                                }}
                                className="w-full h-[46px] bg-slate-900/50 border border-slate-700 rounded-xl px-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                placeholder="Número de teléfono"
                            />
                        </div>
                        {phoneError && (
                            <p className="text-xs text-red-400 mt-1.5">{phoneError}</p>
                        )}
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
