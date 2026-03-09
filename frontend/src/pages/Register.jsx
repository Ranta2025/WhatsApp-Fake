import { useState } from 'react';
import api from '../api/axios';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AuthLayout from '../components/AuthLayout';
import PhoneInput from 'react-phone-input-2';
import 'react-phone-input-2/lib/style.css';
import { validatePhone } from '../utils/phoneValidation';

export default function Register() {
    const [formData, setFormData] = useState({
        username: '',
        email: '',
        numero: '',
        password: ''
    });
    const [confirm, setConfirm] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [error, setError] = useState('');
    const [phoneError, setPhoneError] = useState('');
    const [phoneLocalNumber, setPhoneLocalNumber] = useState('');
    const [phoneCountryIso, setPhoneCountryIso] = useState('cu');
    const [phoneDialCode, setPhoneDialCode] = useState('53');
    const navigate = useNavigate();
    const { login } = useAuth();

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const buildPhoneE164 = (dialCode, localNumber) => {
        const codeDigits = String(dialCode || '').replace(/\D/g, '');
        const localDigits = String(localNumber || '').replace(/\D/g, '');
        if (!codeDigits && !localDigits) return '';
        return `+${codeDigits}${localDigits}`;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        const phoneResult = validatePhone(formData.numero);
        if (!phoneResult.valid) {
            setError(phoneResult.error);
            setPhoneError(phoneResult.error);
            return;
        }
        // Usar el número formateado E.164 limpio
        const cleanFormData = { ...formData, numero: phoneResult.formatted };

        if (formData.password !== confirm) {
            setError('Las contraseñas no coinciden');
            return;
        }
        try {
            await api.post('/register', cleanFormData);
            // La cookie HttpOnly se setió automáticamente por el servidor
            navigate('/activate', { state: { username: formData.username, gmail: formData.email } });
        } catch (err) {
            const data = err?.response?.data;
            const msg = (typeof data === 'string')
                ? data
                : data?.error || data?.message || err?.message || 'Error al registrar usuario. Verifica los requisitos.';
            setError(msg);
        }
    };

    return (
        <AuthLayout
            title="Crear tu cuenta"
            subtitle="Únete a todos para conversar con tus contactos"
            footer={() => (
                <div className="space-y-2 text-center">
                    <div>
                        <span className="text-slate-400">
                            ¿Ya tienes cuenta?{' '}
                            <Link to="/login" className="text-indigo-400 hover:text-indigo-300 font-semibold transition-colors">
                                Inicia sesión
                            </Link>
                        </span>
                    </div>
                    <div>
                        <span className="text-slate-400">
                            ¿Cuenta inactiva?{' '}
                            <Link to="/activate-existing" className="text-indigo-400 hover:text-indigo-300 font-semibold transition-colors">
                                Activar cuenta
                            </Link>
                        </span>
                    </div>
                </div>
            )}
        >
            {error && <div className="mb-5 rounded-2xl border border-rose-400/20 bg-rose-500/10 p-3 text-center text-sm text-rose-200">{error}</div>}
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-400 sm:grid-cols-3">
                    <div className="rounded-xl bg-slate-950/60 px-3 py-2.5">
                        <div className="uppercase tracking-[0.2em] text-sky-300/80">Perfil</div>
                        <div className="mt-1 text-sm font-semibold text-slate-100">Tu identidad</div>
                    </div>
                    <div className="rounded-xl bg-slate-950/60 px-3 py-2.5">
                        <div className="uppercase tracking-[0.2em] text-emerald-300/80">Telefono</div>
                        <div className="mt-1 text-sm font-semibold text-slate-100">Contacto directo</div>
                    </div>
                    <div className="rounded-xl bg-slate-950/60 px-3 py-2.5">
                        <div className="uppercase tracking-[0.2em] text-amber-300/80">Seguridad</div>
                        <div className="mt-1 text-sm font-semibold text-slate-100">Protección real</div>
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1.5">Usuario</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                            <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                        </div>
                        <input
                            type="text"
                            name="username"
                            onChange={handleChange}
                            className="w-full rounded-2xl border border-white/10 bg-slate-950/70 p-3 pl-10 text-sm text-white placeholder-slate-500 transition-colors focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
                            placeholder="Mínimo 5 caracteres"
                        />
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1.5">Email</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                            <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                        </div>
                        <input
                            type="email"
                            name="email"
                            onChange={handleChange}
                            className="w-full rounded-2xl border border-white/10 bg-slate-950/70 p-3 pl-10 text-sm text-white placeholder-slate-500 transition-colors focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
                            placeholder="ejemplo@gmail.com"
                        />
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1.5">Número de teléfono</label>
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
                                    handleChange({ target: { name: 'numero', value: full } });
                                }}
                                inputProps={{
                                    name: 'numero',
                                    autoFocus: false,
                                    readOnly: true,
                                    tabIndex: -1,
                                }}
                                containerClass="react-tel-input !w-full !h-full"
                                inputClass="!hidden"
                                buttonClass="!absolute !inset-0 !w-full !h-full !bg-slate-950/70 !border !border-white/10 !rounded-2xl hover:!border-sky-400"
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
                                setError('');
                                const full = buildPhoneE164(phoneDialCode, local);
                                handleChange({ target: { name: 'numero', value: full } });
                                if (full && full.length > 3) {
                                    const result = validatePhone(full);
                                    setPhoneError(result.valid ? '' : result.error);
                                } else {
                                    setPhoneError('');
                                }
                            }}
                            className="h-[46px] w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 text-sm text-white placeholder-slate-500 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
                            placeholder="Número de teléfono"
                        />
                    </div>
                    {phoneError && (
                        <p className="text-xs text-red-400 mt-1.5 ml-1">{phoneError}</p>
                    )}
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1.5">Contraseña</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                            <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                        </div>
                        <input
                            type={showPassword ? 'text' : 'password'}
                            name="password"
                            onChange={handleChange}
                            className="w-full rounded-2xl border border-white/10 bg-slate-950/70 p-3 pl-10 pr-12 text-sm tracking-wide text-white placeholder-slate-500 transition-colors focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
                            placeholder="Min. 8 caracteres, número, mayúscula"
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword((v) => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-sm font-medium transition-colors"
                            aria-label="Mostrar/Ocultar contraseña"
                        >
                            {showPassword ? 'Ocultar' : 'Ver'}
                        </button>
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1.5">Confirmar Contraseña</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                            <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                        </div>
                        <input
                            type={showConfirm ? 'text' : 'password'}
                            name="confirm"
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            className="w-full rounded-2xl border border-white/10 bg-slate-950/70 p-3 pl-10 pr-12 text-sm tracking-wide text-white placeholder-slate-500 transition-colors focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
                            placeholder="Repite tu contraseña"
                        />
                        <button
                            type="button"
                            onClick={() => setShowConfirm((v) => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-sm font-medium transition-colors"
                            aria-label="Mostrar/Ocultar confirmación"
                        >
                            {showConfirm ? 'Ocultar' : 'Ver'}
                        </button>
                    </div>
                </div>
                <button
                    type="submit"
                    className="mt-4 w-full rounded-2xl bg-[linear-gradient(135deg,#f59e0b,#ea580c)] py-3.5 font-bold text-white shadow-[0_20px_50px_-20px_rgba(249,115,22,0.8)] transition-all duration-200 hover:scale-[1.01] hover:brightness-110 active:scale-[0.98]"
                >
                    Registrarse
                </button>
            </form>
        </AuthLayout>
    );
}
