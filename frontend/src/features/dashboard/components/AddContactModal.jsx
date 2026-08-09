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
            setAddMsg('Escribe un nombre para guardar este contacto.');
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
                
                setAddMsg('Contacto guardado correctamente.');
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
            const msg = typeof d === 'string' ? d : d?.message || d?.error || 'No pudimos guardar este contacto en este momento.';
            setAddMsg(msg);
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B1120]/80 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md overflow-visible rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(15,23,42,0.94))] shadow-[0_32px_120px_-48px_rgba(15,23,42,0.95)]">
                <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.16),transparent_44%),linear-gradient(135deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))] p-6">
                    <div className="mb-4 flex items-center justify-between">
                        <div>
                            <div className="inline-flex rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-200">Contactos</div>
                            <h2 className="mt-3 text-xl font-semibold text-slate-100">Añadir contacto</h2>
                            <p className="mt-1 text-sm text-slate-400">Guarda este contacto con un nombre claro para encontrarlo y escribirle más rápido.</p>
                        </div>
                        <button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-white/10 hover:text-slate-200">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
                        <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-3 py-2"><span className="block text-slate-500">Región</span><span className="mt-1 block font-semibold text-white uppercase">{phoneCountryIso}</span></div>
                        <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-3 py-2"><span className="block text-slate-500">Código</span><span className="mt-1 block font-semibold text-white">+{phoneDialCode}</span></div>
                    </div>
                </div>
                <form onSubmit={submitAddContact} className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Nombre</label>
                        <input
                            type="text"
                            value={contactNameInput}
                            onChange={(e) => setContactNameInput(e.target.value)}
                            className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-slate-100 placeholder-slate-500 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
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
                                    buttonClass="!absolute !inset-0 !w-full !h-full !bg-slate-950/70 !border !border-white/10 !rounded-2xl hover:!border-emerald-400"
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
                                className="h-[46px] w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 text-sm text-slate-100 placeholder-slate-500 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                                placeholder="Número de teléfono"
                            />
                        </div>
                        {phoneError && (
                            <p className="text-xs text-red-400 mt-1.5">{phoneError}</p>
                        )}
                    </div>
                    {addMsg && (
                        <div className={`rounded-2xl border px-4 py-3 text-sm ${addMsg.includes('exitosamente') ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200' : 'border-rose-400/20 bg-rose-500/10 text-rose-200'}`}>
                            {addMsg}
                        </div>
                    )}
                    <div className="flex gap-3 border-t border-white/10 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 rounded-2xl bg-slate-800 px-4 py-3 font-medium text-slate-300 transition-colors hover:bg-slate-700"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="flex-1 rounded-2xl bg-[linear-gradient(135deg,#10b981,#0f766e)] px-4 py-3 font-medium text-white shadow-[0_18px_45px_-20px_rgba(16,185,129,0.9)] transition-all hover:brightness-110 active:scale-[0.98]"
                        >
                            {isLoading ? 'Guardando...' : 'Guardar contacto'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AddContactModal;
