import React from 'react';
import { useDashboard } from '../context/DashboardContext';

const NotificationBanner = () => {
    const { notifPermission, setNotifPermission, requestNotificationPermission } = useDashboard();

    if (notifPermission !== 'default') return null;

    return (
        <div className="fixed left-1/2 top-4 z-[9999] flex max-w-md -translate-x-1/2 items-center gap-3 rounded-[1.4rem] border border-white/10 bg-[linear-gradient(135deg,rgba(14,165,233,0.96),rgba(15,23,42,0.96))] px-5 py-3.5 text-white shadow-[0_20px_60px_-24px_rgba(14,165,233,0.7)] backdrop-blur-xl">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-white ring-1 ring-white/10">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
            </span>
            <div className="flex-1 text-sm">
                <div className="font-semibold">No te pierdas ninguna conversación</div>
                <div className="mt-0.5 text-xs text-sky-100/80">Recibe avisos al instante y mantente al día sin importar dónde estés</div>
            </div>
            <button
                onClick={async () => {
                    const perm = await requestNotificationPermission();
                    setNotifPermission(perm);
                }}
                className="flex-shrink-0 rounded-xl bg-white px-3 py-2 text-xs font-bold text-sky-700 transition hover:bg-sky-50"
            >
                Permitir
            </button>
            <button
                onClick={() => setNotifPermission('dismissed')}
                className="text-lg leading-none text-white/50 transition hover:text-white"
            >
                ×
            </button>
        </div>
    );
};

export default NotificationBanner;
