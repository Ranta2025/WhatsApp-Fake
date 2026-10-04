import { useDashboard } from '../context/DashboardContext';
import { BellIcon } from '../../../components/ui/icons';
import { setPushOptedOut } from '../../../utils/push';

const NotificationBanner = () => {
    const { notifPermission, setNotifPermission, requestNotificationPermission, user } = useDashboard();

    if (notifPermission !== 'default') return null;

    return (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-toast bg-indigo-600 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 max-w-sm">
            <BellIcon className="w-6 h-6 flex-shrink-0" />
            <div className="flex-1 text-sm">
                <div className="font-semibold">Activa las notificaciones</div>
                <div className="text-indigo-200 text-xs mt-0.5">Recibe mensajes aunque no estés en la app</div>
            </div>
            <button
                onClick={async () => {
                    // Activación explícita: anula una baja voluntaria anterior de este usuario
                    // (antes de pedir permiso: al concederse, usePushSync suscribe enseguida).
                    if (user?.telephon) setPushOptedOut(user.telephon, false);
                    const perm = await requestNotificationPermission();
                    setNotifPermission(perm);
                }}
                className="bg-white text-indigo-700 font-bold text-xs px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition flex-shrink-0"
            >
                Activar
            </button>
            <button
                onClick={() => setNotifPermission('dismissed')}
                className="text-white/50 hover:text-white text-lg leading-none"
            >
                ×
            </button>
        </div>
    );
};

export default NotificationBanner;
