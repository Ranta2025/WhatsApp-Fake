import { useEffect, useState } from 'react';
import { useDashboard } from '../context/DashboardContext';
import { getPushConfig, setPushPreview } from '../../../api/pushApi';
import {
    ensurePushSubscription, getCurrentPushSubscription, isPushSupported, removePushSubscription,
} from '../../../utils/push';
import type { PushConfig } from '../../../types/api';

/**
 * Ajustes de Web Push (dentro del modal de perfil). Solo se muestra cuando el
 * navegador soporta push y el servidor lo tiene habilitado (`push/config`).
 */

interface SwitchProps {
    label: string;
    description: string;
    checked: boolean;
    disabled: boolean;
    onToggle: () => void;
}

const Switch = ({ label, description, checked, disabled, onToggle }: SwitchProps) => (
    <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
            <div className="text-sm text-slate-200">{label}</div>
            <div className="text-xs text-slate-500">{description}</div>
        </div>
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            disabled={disabled}
            onClick={onToggle}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${checked ? 'bg-indigo-600' : 'bg-slate-600'}`}
        >
            <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
    </div>
);

const PushSettings = () => {
    const { requestNotificationPermission } = useDashboard();
    const [config, setConfig] = useState<PushConfig | null>(null);
    const [subscribed, setSubscribed] = useState(false);
    const [preview, setPreview] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!isPushSupported()) return;
        let cancelled = false;
        void (async () => {
            try {
                const cfg = await getPushConfig();
                if (cancelled || !cfg?.enabled) return;
                const current = await getCurrentPushSubscription();
                if (cancelled) return;
                setConfig(cfg);
                setPreview(cfg.preview);
                setSubscribed(current !== null);
            } catch (err) {
                console.error('[Push] Error cargando la configuración push:', err);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    if (!config) return null;

    const enablePush = async (): Promise<void> => {
        if (Notification.permission !== 'granted') {
            let permission: NotificationPermission = 'default';
            try {
                permission = await requestNotificationPermission();
            } catch (err) {
                console.error('[Push] Error solicitando permiso:', err);
            }
            if (permission !== 'granted') {
                setError('Debes dar permiso de notificaciones en el navegador');
                return;
            }
        }
        const ok = await ensurePushSubscription(config);
        setSubscribed(ok);
        if (!ok) setError('No se pudieron activar las notificaciones push');
    };

    const disablePush = async (): Promise<void> => {
        await removePushSubscription();
        setSubscribed((await getCurrentPushSubscription()) !== null);
    };

    const togglePush = async () => {
        setBusy(true);
        setError('');
        try {
            if (subscribed) await disablePush();
            else await enablePush();
        } finally {
            setBusy(false);
        }
    };

    const togglePreview = async () => {
        const next = !preview;
        setBusy(true);
        setError('');
        setPreview(next);
        try {
            await setPushPreview(next);
        } catch (err) {
            console.error('[Push] Error guardando la vista previa:', err);
            setPreview(!next);
            setError('No se pudo guardar la preferencia');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-3" data-testid="push-settings">
            <label className="block text-sm font-medium text-slate-300">Notificaciones</label>
            <Switch
                label="Notificaciones push"
                description="Recibe mensajes aunque no estés en la app"
                checked={subscribed}
                disabled={busy}
                onToggle={() => { void togglePush(); }}
            />
            <Switch
                label="Mostrar vista previa"
                description="Muestra el texto del mensaje en la notificación"
                checked={preview}
                disabled={busy}
                onToggle={() => { void togglePreview(); }}
            />
            {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
        </div>
    );
};

export default PushSettings;
